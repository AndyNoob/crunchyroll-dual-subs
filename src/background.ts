import browser, {type Runtime, type Tabs, type WebRequest} from "webextension-polyfill";
import {setHeaders} from "./data/headers";
import {bundleCues, getPlaybackBlockedUntil, notifyCueRefresh} from "./handlers/manager";
import {grabSelectedProfile, handleProfiles} from "./handlers/profiles";
import {grabEpisodeManifest, handleEpisodeManifest} from "./handlers/episode";
import {getScopedPreference, resolvePreference, setPreference} from "./handlers/preferences";
import {getFromAllProfiles, getProfile} from "./data/profiles";
import {setNextRequestTime, shortenUrl, sleep} from "./utils";
import type {PreferencePatch, PreferenceScope} from "./data/preferences";
import {findEpisodeGuid, findSeasonGuid, getEpisodeManifest} from "./data/episode";
import {grabSubtitleManifest, handleSubtitleManifest} from "./handlers/subtitles/loader";
import {getCachedSubtitleManifest} from "./handlers/subtitles/cacher";

console.log("[dual-sub] background loaded");

browser.runtime.onMessage.addListener(async (msg: any, sender: Runtime.MessageSender) => {
  if (sender.tab == null) return await receivePopupMsg(msg, sender);
  else return await receiveContentMsg(msg, sender);
});
browser.webRequest.onBeforeRequest.addListener(receiveMiscReqs, {urls: ["*://www.crunchyroll.com/*"]});
browser.tabs.onUpdated.addListener(receiveTabUpdate);
browser.runtime.onUpdateAvailable.addListener(receiveUpdateNotif);

async function resolveSubManifest(tabId: number) {
  let manifest = getEpisodeManifest(tabId);
  if (!manifest) {
    console.log("eps manifest not found, loading...");
    manifest = await grabEpisodeManifest(tabId);
  }
  let val = await getCachedSubtitleManifest(manifest, true);
  if (!val) {
    console.log("sub manifest not found, loading...");
  }
  return val ?? (await grabSubtitleManifest(tabId));
}

async function receiveContentMsg(msg: any, sender: Runtime.MessageSender) {
  const isValid: boolean = sender.tab != null && sender.tab.id != null && sender.tab.id >= 0;
  if (!isValid) return Promise.reject();
  const tabId: number = sender.tab!.id!;
  switch (msg?.type) {
    case "GET_CUES":
    case "REFRESH_CUES": {
      const refresh = msg?.type === "REFRESH_CUES";
      return await bundleCues(tabId, refresh);
    }
    case "GET_CHOICES": {
      console.groupCollapsed(`[receiveContentMsg] GET_MANIFEST(${tabId}): retrieving...`);
      try {
        return await resolveSubManifest(tabId);
      } finally {
        console.groupEnd();
      }
    }
    case "GET_PREFERENCE":
      await grabEpisodeManifest(tabId);
      const preference = await resolvePreference(
        getProfile(tabId) ?? await grabSelectedProfile(tabId),
        findSeasonGuid(tabId)!,
        findEpisodeGuid(tabId)!
      );
      console.log("[receiveContentMsg] GET_PREFERENCE", preference);
      return preference;
    case "SET_PREFERENCE":
      if (msg.scope !== "global" && !getEpisodeManifest(tabId)) {
        console.log("[receiveContentMsg] SET_PREFERENCE: manifest not found, loading...");
        await grabEpisodeManifest(tabId);
      }
      const scope: PreferenceScope = msg.scope ?? "global";
      const set = await setPreference(scope,
        getProfile(tabId) ?? await grabSelectedProfile(tabId),
        msg.pref!,
        findSeasonGuid(tabId),
        findEpisodeGuid(tabId)
      );
      console.log(`[receiveContentMsg] SET_PREFERENCE(${scope}): done`, msg, set);
      break;
    case "REFRESH_TAB": {
      return browser.tabs.reload(tabId);
    }
    case "MONKEY_PATCH_UPDATE": {
      const {detail} = msg;
      console.log(`[receiveContentMsg] MONKEY_PATCH_UPDATE(${detail.type})`, detail.payload);
      switch (detail.type) {
        case "playback": {
          const epsManifest = await grabEpisodeManifest(tabId);
          return await handleSubtitleManifest(epsManifest, detail.payload);
        }
        case "manifest": {
          return await handleEpisodeManifest(tabId, detail.payload);
        }
        case "profiles": {
          return handleProfiles(tabId, detail.payload);
        }
        case "token": {
          const headers = [{
            name: "authorization",
            value: `${detail.payload.token_type} ${detail.payload.access_token}`
          }];
          if (setHeaders(tabId, headers))
            console.info("authorization token received!");
          break;
        }
      }
    }
  }
}

async function receivePopupMsg(msg: any, sender: Runtime.MessageSender) {
  if (sender.tab != null) return;
  const tabId: number = msg.tabId;
  try {
    switch (msg.type) {
      case "GET_CONTEXT": {
        console.groupCollapsed(`[receivePopupMsg] GET_CONTEXT(${tabId}): retrieving...`);
        await grabEpisodeManifest(tabId);
        const seasonGuid = findSeasonGuid(tabId);
        const episodeGuid = findEpisodeGuid(tabId);
        const currentProfile = await grabSelectedProfile(tabId);
        const response = {
          seasonGuid,
          episodeGuid,
          currentProfile
        };
        console.log(response);
        return response;
      }
      case "GET_MANIFEST": {
        console.groupCollapsed(`[receivePopupMsg] GET_MANIFEST(${tabId}): retrieving...`);
        const manifest = await resolveSubManifest(tabId);
        console.log(manifest);
        return manifest;
      }
      case "GET_SCOPED_PREFERENCE": {
        console.groupCollapsed(`[receivePopupMsg] GET_SCOPED_PREFERENCE(${tabId}): retrieving...`);
        const seasonGuid: string = msg.seasonGuid;
        const episodeGuid: string = msg.episodeGuid;
        const profileId: string = msg.profileId;
        const scope: PreferenceScope = msg.scope;

        console.log({
          seasonGuid, episodeGuid, profileId, scope
        });

        let profile = await resolveProfile(tabId, profileId);
        if (!profile) {
          console.log(`still could not find profile ${profileId}`);
          return Promise.reject("failed to find profile");
        }

        const pref = await getScopedPreference(scope, profile, seasonGuid, episodeGuid);
        console.log("pref is", pref);
        return pref;
      }
      case "SET_SCOPED_PREFERENCE": {
        console.groupCollapsed(`[receivePopupMsg] SET_SCOPED_PREFERENCE(${tabId}): applying new pref...`);
        const pref: PreferencePatch = msg.pref;
        const seasonGuid: string = msg.seasonGuid;
        const episodeGuid: string = msg.episodeGuid;
        const profileId: string = msg.profileId;
        const scope: PreferenceScope = msg.scope;

        console.log(pref);
        console.log(scope);
        console.log({
          seasonGuid, episodeGuid, profileId
        });

        let profile = await resolveProfile(tabId, profileId);
        if (!profile) {
          console.log(`still could not find profile ${profileId}`);
          return Promise.reject("failed to find profile");
        }

        const newPref = await setPreference(scope, profile, pref, seasonGuid, episodeGuid);
        console.log("new pref is", await resolvePreference(profile, seasonGuid, episodeGuid));
        return newPref;
      }
      case "GET_PLAYBACK_BLOCK_STATUS": {
        return {
          blockedUntil: getPlaybackBlockedUntil()
        };
      }
    }
  } finally {
    console.groupEnd();
  }
}

async function resolveProfile(tabId: number, profileId: string) {
  let profile = getFromAllProfiles(profileId);
  if (!profile) {
    console.log("re-trying profile search");
    await grabSelectedProfile(tabId);
    profile = getFromAllProfiles(profileId);
  }
  return profile;
}

function receiveMiscReqs(details: WebRequest.OnBeforeRequestDetailsType) {
  if (details.tabId < 0) return;
  if (details.url.includes("?dual_sub=676767")) return;
  setNextRequestTime(performance.now() + 5000);
}

async function receiveTabUpdate(tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, _: Tabs.Tab) {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (!url.includes("crunchyroll.com/watch/")) return;
  console.log(`[dual-sub] new tab url for tab ${tabId} is ${shortenUrl(url)}`);
  await browser.tabs.sendMessage(tabId, {type: "CLEAR_CUES"});
  console.log(`[dual-sub] cleared cues on tab ${tabId}, waiting 3s...`);
  await sleep(3000);
  notifyCueRefresh(tabId, await bundleCues(tabId));
}

function receiveUpdateNotif(details: Runtime.OnUpdateAvailableDetailsType) {
  browser.tabs.query({url: "*://*.crunchyroll.com/*"}).then(tabs => {
    console.groupCollapsed(`[receiveUpdateNotif] received update ${details.version}`);
    for (const tab of tabs) {
      if (tab.id == null) continue;

      browser.tabs.sendMessage(tab.id, {
        type: "UPDATE_AVAILABLE",
        version: details.version
      })
        .then(() => console.log(`${tab.id}: sent`))
        .catch(e => console.warn(`${tab.id}: failed`, e));
    }
    console.groupEnd();
  });
}