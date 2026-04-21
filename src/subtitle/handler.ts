import {parseSubs} from "frazy-parser";
import type {Cue} from "../content";
import {loadAltSubtitles} from "./loader";
import {getHeaders} from "../background";
import browser from "webextension-polyfill";

export async function fetchAndParseSubtitle(url): Promise<Cue[]> {
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
  return parsed.map(cue => ({
    id: cue.id,
    start: cue.start,
    end: cue.end,
    text: (cue.body || [])
      .map(part => cleanSubtitleText(part.text || ""))
      .join("\n")
      .trim()
  }));
}

export function getSubOpt(tabId: number): SubOptions | undefined {
  return subOptMap.get(tabId);
}
export function getProfile(tabId: number): Profile | undefined {
  return profileMap.get(tabId);
}
export function getAltCues(tabId: number): Cue[] | undefined {
  return cueMap.get(tabId);
}
const subOptMap = new Map<number, SubOptions>();
const cueMap = new Map<number, Cue[]>();
const profileMap = new Map<number, Profile>();

export async function handlePlayback(playback, tabId: number): Promise<Cue[]> {
  const ccs: Subtitle = playback["captions"];
  const subs: Subtitle = playback["subtitles"];
  subOptMap.set(tabId, {url: playback["url"], ccs, subs});
  const profile = getProfile(tabId);
  if (!profile) {
    console.log("[dual-sub] profile isn't loaded on handle playback.");
    await grabProfile(tabId);
  }
  const cues = await loadAltSubtitles(() => console.log("[dual-sub] alt cues loaded"), tabId);
  cueMap.set(tabId, cues);
  browser.tabs.sendMessage(tabId, {
    type: "REFRESH_CUES",
    cues: cues
  }).catch(e => console.warn("[dual-sub] failed to notify cue refresh", e))
    .then(() => console.log(`[dual-sub] sent refresh cue to tab ${tabId}`));
  return cues;
}

export function handleProfile(data: object, tabId: number): Profile {
  const profiles: Profile[] = (data?.["profiles"] as [RawProfile]).map(a => mapProfile(a));
  let selected: Profile;
  for (let profile: Profile of profiles) {
    if (profile.isSelected) {
      selected = profile;
      break;
    }
  }
  profileMap.set(tabId, selected);
  return selected;
}

export async function grabProfile(tabId: number): Promise<Profile> {
  const headers = getHeaders(tabId);
  if (!headers) return Promise.reject("no auth");
  const response = await fetch("https://www.crunchyroll.com/accounts/v1/me/multiprofile", {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
      "Cookies": findHeaderValue(headers, "Cookie")
    }
  });
  if (!response.ok) return Promise.reject("failed to grab profile");
  return handleProfile(await response.json(), tabId);
}

export async function grabPlayback(tabId: number) {
  const headers = getHeaders(tabId);
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
  const response = await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play`, {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
      "Cookies": findHeaderValue(headers, "Cookie"),
      "Referer": url,
      // don't ask me how i found this
      // just know it took a while
      "x-cr-tab-id": sessionStorage.getItem("cx-tab-id")
    }
  });
  if (!response.ok) {
    return Promise.reject("failed to grab playback");
  }
  return await handlePlayback(await response.json(), tabId);
}

function findHeaderValue(headers: Header[], name: string): string {
  return headers.find((h) => h.name === name)!.value!;
}

export interface Subtitle {
  [key: string]: {
    language: string,
    format?: string,
    url?: string
  }
}

interface RawProfile {
  is_selected: boolean;
  preferred_content_subtitle_language: string;
  prefer_closed_captions: boolean;
}

function mapProfile(raw: RawProfile): Profile {
  return {
    isSelected: raw.is_selected,
    subLanguage: raw.preferred_content_subtitle_language,
    preferCc: raw.prefer_closed_captions
  };
}

export interface Profile {
  isSelected: boolean;
  subLanguage: string;
  preferCc: boolean;
}

export interface SubOptions {
  url: string,
  ccs: Subtitle,
  subs: Subtitle
}

export interface Header {
  name: string,
  value?: string
}