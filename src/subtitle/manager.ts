import type {Cue} from "../content";
import browser from "webextension-polyfill";
import {grabAndHandleProfile, type Header} from "./handler";
import {loadCues, type Preference} from "./loader";

export function getSubChoices(tabId: number): SubChoices | undefined {
  return subChoicesMap.get(tabId);
}

export function getProfile(tabId: number): Profile | undefined {
  return profileMap.get(tabId);
}

export function getAltCues(tabId: number, url: string, audio: string | null): Cue[] | undefined | null {
  if (!cueMap.has(tabId)) return undefined;
  if (audioMap.get(tabId) !== audio) return null;
  const inMap = urlMap.get(tabId)!;
  const search = normalizeUrl(url);
  if (inMap.includes(search) || search.includes(inMap)) {
    return cueMap.get(tabId);
  } else {
    console.log(`[getAltCues] expected ${inMap} but found ${search}`);
    return null;
  }
}

export function setProfile(tabId: number, profile: Profile) {
  profileMap.set(tabId, profile);
}

export function getAudio(tabId: number) {
  return audioMap.get(tabId);
}

export function normalizeUrl(url: string) {
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

export function setAudio(tabId: number, audio: string) {
  console.log(`[setAudio] new audio is ${audio}`)
  audioMap.set(tabId, audio);
}

export function setSubChoices(tabId: number, opt: SubChoices) {
  subChoicesMap.set(tabId, opt);
}

const subChoicesMap = new Map<number, SubChoices>();
const cueMap = new Map<number, Cue[]>();
const urlMap = new Map<number, string>();
const audioMap = new Map<number, string>();
const profileMap = new Map<number, Profile>();

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
  await loadCues(tabId, pref);
  console.log(`[setPreference] set preference!`, rawPrefs);
}

export function notifyCueRefresh(tabId: number, cues: Cue[], attemptsLeft = 3) {
  if (attemptsLeft <= 0) return;
  browser.tabs.sendMessage(tabId, {
    type: "REFRESH_CUES",
    cues: cues
  }).catch(e => {
    console.warn("[notifyCueRefresh] failed to notify cue refresh", e);
    setTimeout(() => {
      notifyCueRefresh(tabId, cues, --attemptsLeft);
    }, 5000);
  }).then(() => console.log(`[notifyCueRefresh] sent refresh cue to tab ${tabId}`));
}

export interface RawProfile {
  is_selected: boolean;
  preferred_content_subtitle_language: string;
  prefer_closed_captions: boolean;
  profile_id: string;
}

export function mapProfile(raw: RawProfile): Profile {
  return {
    isSelected: raw.is_selected,
    subLanguage: raw.preferred_content_subtitle_language,
    doCc: !raw.prefer_closed_captions,
    profileId: raw.profile_id
  };
}

export interface Profile {
  isSelected: boolean;
  subLanguage: string;
  doCc: boolean;
  profileId: string;
}

export interface SubChoices {
  url: string,
  ccs: Subtitle,
  subs: Subtitle
}

export interface Subtitle {
  [key: string]: {
    language: string,
    format?: string,
    url?: string
  }
}

export async function getOrLoadHeaders(tabId: number) {
  let header = headersMap.get(tabId);
  if (!header) {
    console.log(`[getOrLoadHeaders] headers not found for tab ${tabId}, messaging for content script to try hack.`);
    try {
      await browser.runtime.sendMessage({type: "TRY_HACK"});
    } catch {
      return Promise.reject("hack failed");
    }
    console.log(`[getOrLoadHeaders] hack on tab ${tabId} is complete.`);
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