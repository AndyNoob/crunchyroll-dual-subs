import type {Cue} from "../content";
import browser from "webextension-polyfill";
import type {Header} from "./handler";

export function getSubOpt(tabId: number): SubOptions | undefined {
  return subOptMap.get(tabId);
}

export function getProfile(tabId: number): Profile | undefined {
  return profileMap.get(tabId);
}

export function getAltCues(tabId: number, url: string): Cue[] | undefined | null {
  return urlMap.get(tabId)?.includes(normalizeUrl(url)) ? cueMap.get(tabId) : null;
}

export function setProfile(tabId: number, profile: Profile) {
  profileMap.set(tabId, profile);
}

function normalizeUrl(url: string) {
  const normalized = new URL(url);
  normalized.search = '';
  normalized.hash = '';
  return normalized.toString();
}

export function setAltCues(tabId: number, cues: Cue[], url: string) {
  cueMap.set(tabId, cues);
  const value = normalizeUrl(url);
  urlMap.set(tabId, value);
}

export function setSubOpt(tabId: number, opt: SubOptions) {
  subOptMap.set(tabId, opt);
}

const subOptMap = new Map<number, SubOptions>();
const cueMap = new Map<number, Cue[]>();
const urlMap = new Map<number, string>();
const profileMap = new Map<number, Profile>();

export function notifyCueRefresh(tabId: number, cues: Cue[], attemptsLeft = 3) {
  browser.tabs.sendMessage(tabId, {
    type: "REFRESH_CUES",
    cues: cues
  }).catch(e => {
    console.warn("[dual-sub] failed to notify cue refresh", e);
    setTimeout(() => {
      notifyCueRefresh(tabId, cues, --attemptsLeft);
    }, 5000);
  })
    .then(() => console.log(`[dual-sub] sent refresh cue to tab ${tabId}`));
}

export interface Subtitle {
  [key: string]: {
    language: string,
    format?: string,
    url?: string
  }
}

export interface RawProfile {
  is_selected: boolean;
  preferred_content_subtitle_language: string;
  prefer_closed_captions: boolean;
}

export function mapProfile(raw: RawProfile): Profile {
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

export async function getOrLoadHeaders(tabId: number) {
  let header = headersMap.get(tabId);
  if (!header) {
    console.log(`[dual-sub] headers not found for tab ${tabId}, messaging for content script to try hack.`);
    try {
      await browser.runtime.sendMessage({type: "TRY_HACK"});
    } catch {
      return Promise.reject("hack failed");
    }
    console.log(`[dual-sub] hack on tab ${tabId} is complete.`);
    header = headersMap.get(tabId);
  }
  return header;
}

export function setHeaders(tabId: number, headers: Header[]) {
  for (let header of headers) {
    if (header.name.toLowerCase().includes("authorization")) {
      headersMap.set(tabId, headers);
      return true;
    }
  }
  return false;
}

const headersMap = new Map<number, Header[]>();