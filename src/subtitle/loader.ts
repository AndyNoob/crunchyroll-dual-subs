import type {Cue} from "../content";
import {getSubChoices, notifyCueRefresh, setAltCues, type Subtitle} from "./manager";
import {parseSubs} from "frazy-parser";
import {grabAndHandleProfile} from "./handler";
import browser from "webextension-polyfill";

export async function loadCues(tabId: number, preference: Preference | null, notify: boolean = false) {
  if (!preference) {
    console.log("[loadCues] profile isn't loaded on load alt sub.");
    preference = await grabAndHandleProfile(tabId);
  }
  const cues = await loadAltSubtitles(() => console.log(`[loadCues] alt cues loaded for tab ${tabId}`), tabId, preference);
  setAltCues(tabId, cues, (await browser.tabs.get(tabId)).url!);
  if (notify) notifyCueRefresh(tabId, cues);
  return cues;
}

export async function fetchAndParseSubtitle(tabId: number, url: string): Promise<Cue[]> {
  console.log(`[fetchAndParseSubtitle] fetching sub from ${url}`);
  // const res = await fetch(url);
  // if (!res.ok) {
  //   console.error(`[fetchAndParseSubtitle] failed to fetch subtitle: ${res.status}`);
  //   return Promise.reject("failed to fetch");
  // }
  // console.log("[fetchAndParseSubtitle] done fetching.");
  // const raw = await res.text();
  const raw = (await browser.tabs.sendMessage(tabId, {type: "FETCH_SUBTITLE", url})) as string;
  if (raw.length === 0) {
    console.log("[fetchAndParseSubtitle] subtitle request returned empty.");
    return [];
  }
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

async function loadAltSubtitles(callback: CallableFunction, tabId: number, preference: Preference): Promise<Cue[]> {
  console.log("[loadAltSubtitles] begin load alt subs");
  const subOptions = getSubChoices(tabId);
  if (!subOptions) {
    throw new Error("[loadAltSubtitles] sub choice not found");
  }
  const altSub: Subtitle = preference.doCc ? subOptions.ccs : subOptions.subs;
  const sub = altSub[preference.subLanguage];
  if (!sub || !sub.url) {
    console.warn("[loadAltSubtitles] alternate subtitle is none");
    return [];
  }
  const cues = await fetchAndParseSubtitle(tabId, sub.url);
  console.log(preference)
  console.log(`[loadAltSubtitles] loaded ${cues.length} alternate cues from ${sub.language} ${preference.doCc ? "[CC]" : ""}`);
  callback();
  return cues;
}

export interface Preference {
  doCc: boolean,
  subLanguage: string
}