import browser from "webextension-polyfill";
import {
  getOrLoadHeaders,
  mapProfile,
  setProfile,
  setEpisodeManifest,
  type Profile,
  type RawProfile,
  type Subtitle, normalizeUrl, type EpisodeManifest, getEpisodeManifest, getProfile, setAudio,
} from "./manager";

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
  for (let profile of profiles) {
    if (profile.isSelected) {
      selected = profile;
      break;
    }
  }
  if (!selected) throw new Error("No profile selected");
  setProfile(tabId, selected);
  return selected;
}

let waitUntil: number = 0;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      "Cookies": findHeaderValue(headers, "Cookie")
    }
  });
  waitUntil = performance.now() + 5000;
  if (!response.ok) return Promise.reject("failed to grab profile");
  return handleProfile(await response.json(), tabId);
}

export async function grabAndHandleManifest(tabId: number, refresh: boolean = false) {
  if (!refresh) {
    const manifest = getEpisodeManifest(tabId);
    if (manifest) return manifest;
  }
  const headers = await getOrLoadHeaders(tabId);
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
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  try {
    response = await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play?dual_sub=676767`, {
      headers: {
        "Authorization": findHeaderValue(headers, "Authorization"),
        "Cookies": findHeaderValue(headers, "Cookie"),
        "Referer": url,
        "x-cr-tab-id": await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})
      } as Record<string, string>
    });
  } catch (e) {
    console.error("[grabAndHandleManifest] fetch failed", e);
  }
  if (response && response.status === 420) {
    console.log("[grabAndHandleManifest] got 420, trying to re-fetch after 3s...");
    await sleep(3000);
    try {
      response = await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play?dual_sub=676767`, {
        headers: {
          "Authorization": findHeaderValue(headers, "Authorization"),
          "Cookies": findHeaderValue(headers, "Cookie"),
          "Referer": url,
          "x-cr-tab-id": await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})
        } as Record<string, string>
      });
    } catch (e) {
      console.error("[grabAndHandleManifest] re-fetch failed", e);
    }
  }
  waitUntil = performance.now() + 5000;
  if (!response || !response.ok) {
    console.log(`[grabAndHandleManifest] fetch failed with status ${response?.status}`);
    return Promise.reject("failed to grab sub choice");
  }
  return await handleManifestAndAudio(await response.json(), tabId);
}

function findHeaderValue(headers: Header[], name: string): string {
  try {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())!.value!;
  } catch (e) {
    console.log(`failed to find value of ${name}`, headers);
    throw e;
  }
}

export interface Header {
  name: string,
  value?: string
}