import browser from "webextension-polyfill";
import {
  getOrLoadHeaders,
  mapProfile,
  setProfile,
  setSubChoices,
  type Profile,
  type RawProfile,
  type Subtitle, normalizeUrl, type SubChoices, getSubChoices, getProfile, setAudio,
} from "./manager";

export async function handleSubChoiceAndAudio(playback: any, tabId: number): Promise<SubChoices> {
  const ccs: Subtitle = playback["captions"];
  const subs: Subtitle = playback["subtitles"];
  console.log(`[handleSubChoice] audio locale for tab ${tabId} is ${playback["audioLocale"]}`);
  setAudio(tabId, playback["audioLocale"]);
  const choices: SubChoices = {url: normalizeUrl((await browser.tabs.get(tabId)).url!), ccs, subs};
  setSubChoices(tabId, choices);
  return choices;
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

export async function grabAndHandleSubChoices(tabId: number, refresh: boolean = false) {
  if (!refresh) {
    const subChoices = getSubChoices(tabId);
    if (subChoices) return subChoices;
  }
  const headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    console.log("[grabAndHandleSubChoices] headers not set")
    return Promise.reject("no auth");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (!url) {
    console.log("[grabAndHandleSubChoices] url not found, aborting");
    return Promise.reject(`could not find url of tab ${tabId}`);
  }
  const contentId = url.match(/crunchyroll\.com\/watch\/(.+)\//)![1];
  const device = "firefox"; // phone,tablet,android_tv,firefox,chrome
  const deviceType = "web";
  console.log("[grabAndHandleSubChoices] fetching...");
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
    console.error("[grabAndHandleSubChoices] fetch failed", e);
  }
  waitUntil = performance.now() + 5000;
  if (!response || !response.ok) {
    return Promise.reject("failed to grab sub choice");
  }
  return await handleSubChoiceAndAudio(await response.json(), tabId);
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