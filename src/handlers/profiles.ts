import browser from "webextension-polyfill";
import {normalizeUrl, setNextRequestTime, sleep, waitUntil,} from "./manager";
import {
  addToAllProfiles,
  clearAllProfiles,
  getProfile,
  mapProfile,
  type Preference,
  type Profile,
  type RawProfile,
  setProfile
} from "../data/profiles";
import {findHeaderValue, getOrLoadHeaders, type Header} from "../data/headers";
import {type EpisodeManifest, getEpisodeManifest, setAudio, setEpisodeManifest, type Subtitle} from "../data/subtitles";

export async function handleManifestAndAudio(playback: any, tabId: number): Promise<EpisodeManifest> {
  const ccs: Subtitle = playback["captions"];
  const subs: Subtitle = playback["subtitles"];
  console.log(`[handleManifestAndAudio] audio locale for tab ${tabId} is ${playback["audioLocale"]}`);
  setAudio(tabId, playback["audioLocale"]);
  const manifest: EpisodeManifest = {url: normalizeUrl((await browser.tabs.get(tabId)).url!), ccs, subs};
  setEpisodeManifest(tabId, manifest);
  return manifest;
}

export function handleProfile(data: any, tabId: number): Profile {
  const profiles: Profile[] = (data?.["profiles"] as [RawProfile]).map(a => mapProfile(a));
  let selected: Profile | null = null;
  clearAllProfiles();
  console.groupCollapsed(`[handleProfile] adding ${profiles.length} profiles`);
  for (let profile of profiles) {
    addToAllProfiles(profile);
    console.log(profile);
    if (profile.isSelected) {
      selected = profile;
    }
  }
  console.groupEnd();
  if (!selected) throw new Error("No profile selected");
  setProfile(tabId, selected);
  return selected;
}

export async function grabAndHandleProfile(tabId: number, refresh: boolean = false): Promise<Profile> {
  if (!refresh) {
    const profile = getProfile(tabId);
    if (profile) return profile;
  }
  const headers = await getOrLoadHeaders(tabId);
  if (!headers) return Promise.reject("no auth");
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  const response = await fetch("https://www.crunchyroll.com/accounts/v1/me/multiprofile?dual_sub=676767", {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
    }
  });
  setNextRequestTime(performance.now() + 5000);
  if (!response.ok) return Promise.reject("failed to grab profile");
  return handleProfile(await response.json(), tabId);
}

async function sendManifestRequest(contentId: string | undefined, deviceType: string, device: string, headers: Header[], crTabId: string) {
  if (!contentId) return null;
  console.log(`[grabAndHandleManifest] cr-tab-id is ${crTabId}`);
  return await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play?dual_sub=676767`, {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
      "x-cr-tab-id": crTabId
    } as Record<string, string>,
    credentials: "omit"
  });
}

export async function grabAndHandleManifest(tabId: number, refresh: boolean = false) {
  if (!refresh) {
    const manifest = getEpisodeManifest(tabId);
    if (manifest) return manifest;
  }
  let headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    console.log("[grabAndHandleManifest] headers not set")
    return Promise.reject("no auth");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (!url) {
    console.log("[grabAndHandleManifest] url not found, aborting");
    return Promise.reject(`could not find url of tab ${tabId}`);
  }
  const contentId = url.match(/crunchyroll\.com\/watch\/(.+)\//)![1];
  const device = "firefox"; // phone,tablet,android_tv,firefox,chrome
  const deviceType = "web";
  console.log("[grabAndHandleManifest] fetching...");
  // courtesy of https://github.com/Crunchyroll-Plus/crunchyroll-docs/blob/release/Services/Play/GET/getPlayStream.md
  let response = null;
  await sleep(1600); // always sleep to try and mitigate 420 stream limits
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  try {
    const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
    response = await sendManifestRequest(contentId, deviceType, device, headers, crTabId);
  } catch (e) {
    console.warn("[grabAndHandleManifest] first fetch failed", e);
  }
  if (response && !response.ok) {
    console.warn(`[grabAndHandleManifest] got ${response.status}, trying to re-fetch after 3s...`);
    if (response.status === 401) {
      console.log("[grabAndHandleManifest] refreshing headers...");
      headers = await getOrLoadHeaders(tabId, true);
      if (!headers) {
        console.log("[grabAndHandleManifest] could not refresh header");
        return Promise.reject("[grabAndHandleManifest] could not refresh header");
      }
    }
    await sleep(3000);
    try {
      const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
      response = await sendManifestRequest(contentId, deviceType, device, headers, crTabId);
    } catch (e) {
      console.error("[grabAndHandleManifest] re-fetch failed", e);
    }
  }
  setNextRequestTime(performance.now() + 5000);
  if (!response || !response.ok) {
    console.error(`[grabAndHandleManifest] fetch failed with status ${response?.status}`, response);
    return Promise.reject("[grabAndHandleManifest] failed to grab sub choice");
  }
  return await handleManifestAndAudio(await response.json(), tabId);
}

export async function resolvePreference(tabId: number): Promise<Preference> {
  const rawPrefs = ((await browser.storage.sync.get("cr-dual-sub-prefs"))?.["cr-dual-sub-prefs"] ?? {}) as any;
  const profile = getProfile(tabId) ?? await grabAndHandleProfile(tabId);
  const pref: any = rawPrefs[profile.profileId];
  if (pref && "doCc" in pref && "subLanguage" in pref) return pref as Preference;
  rawPrefs[profile.profileId] = profile as Preference;
  await browser.storage.sync.set({"cr-dual-sub-prefs": rawPrefs});
  console.log(`[resolvePreference] set preference!`, rawPrefs);
  return profile;
}

export async function setPreference(tabId: number, pref: Preference) {
  const profile = getProfile(tabId) ?? await grabAndHandleProfile(tabId);
  const rawPrefs = ((await browser.storage.sync.get("cr-dual-sub-prefs"))?.["cr-dual-sub-prefs"] ?? {}) as any;
  rawPrefs[profile.profileId] = pref;
  await browser.storage.sync.set({"cr-dual-sub-prefs": rawPrefs});
  // await loadCues(tabId, pref);
  console.log(`[setPreference] set preference!`, rawPrefs);
}