import browser, {type Runtime, type Tabs, type WebRequest} from "webextension-polyfill";
import {setHeaders} from "./data/headers";
import {notifyCueRefresh} from "./handlers/manager";
import {grabAndHandleProfile, handleProfile} from "./handlers/profiles";
import {grabEpisodeManifest, handleManifestAndAudio} from "./handlers/episode";
import {getScopedPreference, resolvePreference, setPreference} from "./handlers/preferences";
import {getFromAllProfiles, getProfile} from "./data/profiles";
import {setNextRequestTime, shortenUrl} from "./utils";
import type {Preference, PreferenceScope} from "./data/preferences";
import {findEpisodeGuid, findSeasonGuid, getEpisodeManifest} from "./data/episode";
import {grabCues, grabSubtitleManifest} from "./handlers/subtitles/loader";
import {getCachedSubtitleManifest} from "./handlers/subtitles/cacher";

console.log("[dual-sub] background loaded");

let shouldRefresh: boolean = false;
if (__BROWSER_TYPE__ !== "chrome") {
  browser.webRequest.onBeforeRequest.addListener(
    receiveProfileOrPlayback,
    {urls: ["*://www.crunchyroll.com/*"]},
    ["blocking"]
  );
}
browser.runtime.onMessage.addListener(async (msg: any, sender: Runtime.MessageSender) => {
  if (sender.tab == null) return await receivePopupMsg(msg, sender);
  else return await receiveContentMsg(msg, sender);
});
browser.webRequest.onSendHeaders.addListener(
  receiveAuthHeaders,
  {urls: ["*://www.crunchyroll.com/*"]},
  getRequestHeaderSpec()
);
browser.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  if (details.url.includes("?dual_sub=676767")) return;
  setNextRequestTime(performance.now() + 5000);
}, {urls: ["*://www.crunchyroll.com/*"]});
browser.tabs.onUpdated.addListener(receiveTabUpdate);
browser.runtime.onUpdateAvailable.addListener(receiveUpdateNotif);

/**
 * @param tabId id of the tab requesting cue resolution
 * @param refresh refreshes the cache
 */
async function resolveCues(tabId: number, refresh = false) {
  await grabEpisodeManifest(tabId);
  const preference = await resolvePreference(
    getProfile(tabId) ?? await grabAndHandleProfile(tabId),
    findSeasonGuid(tabId)!,
    findEpisodeGuid(tabId)!
  );
  return await grabCues(tabId, preference, refresh);
}

function receiveProfileOrPlayback(details: WebRequest.OnBeforeRequestDetailsType) {
  if (details.tabId < 0) return;
  if (details.url.includes("?dual_sub=676767")) return;
  const isProfile = details.url.includes("/me/multiprofile");
  if (!(details.url.includes(".com/playback/v3") || isProfile)) return;

  console.log(`[receiveProfileOrPlayback] received ${isProfile ? "profile" : "playback"} request with id ${details.requestId}`);

  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");

  let data = "";

  filter.ondata = (e) => {
    const decoded = decoder.decode(e.data);
    data += decoded;
    filter.write(e.data);
  }

  filter.onstop = async () => {
    console.log(`[receiveProfileOrPlayback] finishing request id ${details.requestId}`);
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn(`[receiveProfileOrPlayback] request id ${details.requestId} is extraneous`);
      console.log(data);
      filter.disconnect();
      return;
    }

    filter.disconnect();

    try {
      if (isProfile) handleProfile(parsed, details.tabId);
      else {
        await handleManifestAndAudio(parsed, details.tabId);
        if (shouldRefresh) {
          shouldRefresh = false;
          console.log("[receiveProfileOrPlayback] refresh triggered.");
          notifyCueRefresh(details.tabId, await resolveCues(details.tabId))
        }
      }
      console.log(`[receiveProfileOrPlayback] processed ${isProfile ? "profiles" : "playback"} data on tab ${details.tabId}`);
    } catch (err) {
      console.error("[receiveProfileOrPlayback] processing failed:", err);
    }
  }
}

async function receiveContentMsg(msg: any, sender: Runtime.MessageSender) {
  const isValid: boolean = sender.tab != null && sender.tab.id != null && sender.tab.id >= 0;
  if (!isValid) return Promise.reject();
  const tabId: number = sender.tab!.id!;
  // const url: string = sender.tab!.url!;
  switch (msg?.type) {
    case "GET_CUES":
      return await resolveCues(tabId);
    case "REFRESH_CUES":
      return await resolveCues(tabId, true);
    case "GET_CHOICES":
      let manifest = getEpisodeManifest(tabId);
      if (!manifest) {
        console.log("[receiveContentMsg] GET_CHOICES: eps manifest not found, loading...");
        manifest = await grabEpisodeManifest(tabId);
      }
      let val = await getCachedSubtitleManifest(manifest, true);
      if (!val) {
        console.log("[receiveContentMsg] GET_CHOICES: sub manifest not found, loading...");
      }
      return val ?? (await grabSubtitleManifest(tabId));
    case "GET_PREFERENCE":
      await grabEpisodeManifest(tabId);
      const preference = await resolvePreference(
        getProfile(tabId) ?? await grabAndHandleProfile(tabId),
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
        getProfile(tabId) ?? await grabAndHandleProfile(tabId),
        msg.pref!,
        findSeasonGuid(tabId),
        findEpisodeGuid(tabId)
      );
      console.log(`[receiveContentMsg] SET_PREFERENCE(${scope}): done`, msg, set);
      break;
    case "REFRESH_TAB":
      return browser.tabs.reload(tabId);
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
        const currentProfile = await grabAndHandleProfile(tabId);
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
        const manifest = await grabEpisodeManifest(tabId);
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
        const pref: Partial<Preference> = msg.pref;
        const seasonGuid: string = msg.seasonGuid;
        const episodeGuid: string = msg.episodeGuid;
        const profileId: string = msg.profileId;
        const scope: PreferenceScope = msg.scope;

        console.log({
          pref, seasonGuid, episodeGuid, profileId, scope
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
    }
  } finally {
    console.groupEnd();
  }
}

async function resolveProfile(tabId: number, profileId: string) {
  let profile = getFromAllProfiles(profileId);
  if (!profile) {
    console.log("re-trying profile search");
    await grabAndHandleProfile(tabId);
    profile = getFromAllProfiles(profileId);
  }
  return profile;
}

async function receiveAuthHeaders(details: WebRequest.OnSendHeadersDetailsType) {
  if (details.tabId < 0) return;
  if (details.requestHeaders === undefined) return;
  if (setHeaders(details.tabId, details.requestHeaders))
    console.debug(`[receiveAuthHeaders] headers set for tab ${details.tabId} based off of ${shortenUrl(details.url)}`);
}

async function receiveTabUpdate(tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, _: Tabs.Tab) {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (!url.includes("crunchyroll.com/watch/")) return;
  console.log(`[dual-sub] new tab url for tab ${tabId} is ${shortenUrl(url)}`);
  await browser.tabs.sendMessage(tabId, {type: "CLEAR_CUES"});
  console.log(`[dual-sub] cleared cues on tab ${tabId}`);
  if (__BROWSER_TYPE__ === "chrome") {
    notifyCueRefresh(tabId, await resolveCues(tabId));
  } else {
    shouldRefresh = true;
  }
} // no filter because chrome compat

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

function getRequestHeaderSpec(): WebRequest.OnSendHeadersOptions[] {
  const spec: WebRequest.OnSendHeadersOptions[] = ["requestHeaders"];

  if (__BROWSER_TYPE__ === "chrome") {
    spec.push("extraHeaders");
  }

  return spec;
}