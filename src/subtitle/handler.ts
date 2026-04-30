import {parseSubs} from "frazy-parser";
import type {Cue} from "../content";
import {loadAltSubtitles} from "./loader";
import browser from "webextension-polyfill";
import {
  getProfile,
  mapProfile,
  notifyCueRefresh,
  setAltCues, setProfile, setSubOpt,
  type Profile,
  type RawProfile,
  type Subtitle, getOrLoadHeaders,
} from "./manager";

export async function fetchAndParseSubtitle(url: string): Promise<Cue[]> {
  console.log(`[dual-sub] fetching sub from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[dual-sub] failed to fetch subtitle: ${res.status}`);
    return Promise.reject("failed to fetch");
  }
  const raw = await res.text();
  const parsed = parseSubs(raw);
  return normalizeFrazyCues(parsed);
}

function cleanSubtitleText(text: string): string {
  const withoutTags = text.replace(/<[^>]*>/g, "");
  return withoutTags
    .replace(/\r/g, "")
    .trim();
}

function normalizeFrazyCues(parsed: any[]): Cue[] {
  return parsed.map((cue: any) => ({
    id: cue.id,
    start: cue.start,
    end: cue.end,
    text: (cue.body || [])
      .map((part: any) => cleanSubtitleText(part.text || ""))
      .join("\n")
      .trim()
  }));
}

export async function handlePlayback(playback: any, tabId: number, notify: boolean): Promise<Cue[]> {
  const ccs: Subtitle = playback["captions"];
  const subs: Subtitle = playback["subtitles"];
  setSubOpt(tabId, {url: playback["url"], ccs, subs});
  const profile = getProfile(tabId);
  if (!profile) {
    console.log("[dual-sub] profile isn't loaded on handle playback.");
    await grabAndHandleProfile(tabId);
  }
  const cues = await loadAltSubtitles(() => console.log(`[dual-sub] alt cues loaded for tab ${tabId}`), tabId);
  setAltCues(tabId, cues, (await browser.tabs.get(tabId)).url!);
  if (notify) notifyCueRefresh(tabId, cues);
  return cues;
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

export async function grabAndHandleProfile(tabId: number): Promise<Profile> {
  const headers = await getOrLoadHeaders(tabId);
  if (!headers) return Promise.reject("no auth");
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  const response = await fetch("https://www.crunchyroll.com/accounts/v1/me/multiprofile", {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
      "Cookies": findHeaderValue(headers, "Cookie")
    }
  });
  waitUntil = performance.now() + 5000;
  if (!response.ok) return Promise.reject("failed to grab profile");
  return handleProfile(await response.json(), tabId);
}

export async function grabAndHandlePlayback(tabId: number) {
  const headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    console.log("[dual-sub] headers not set")
    return Promise.reject("no auth");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (!url) {
    console.log("[dual-sub] url not found, aborting");
    return Promise.reject(`could not find url of tab ${tabId}`);
  }
  const contentId = url.match(/crunchyroll\.com\/watch\/(.+)\//)![1];
  const device = "firefox"; // phone,tablet,android_tv,firefox,chrome
  const deviceType = "web";
  console.log("[dual-sub] fetching...");
  // courtesy of https://github.com/Crunchyroll-Plus/crunchyroll-docs/blob/release/Services/Play/GET/getPlayStream.md
  let response = null;
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  try {
    response = await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play`, {
      headers: {
        "Authorization": findHeaderValue(headers, "Authorization"),
        "Cookies": findHeaderValue(headers, "Cookie"),
        "Referer": url,
        "x-cr-tab-id": await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})
      } as Record<string, string>
    });
  } catch (e) {
    console.error("[dual-sub] fetch failed", e);
  }
  waitUntil = performance.now() + 5000;
  if (!response || !response.ok) {
    return Promise.reject("failed to grab playback");
  }
  return await handlePlayback(await response.json(), tabId, false);
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