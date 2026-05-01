import type {Cue} from "../content";
import {getSubChoices, notifyCueRefresh, setAltCues, type Subtitle} from "./manager";
import {parseSubs} from "frazy-parser";
import {grabAndHandleProfile} from "./handler";
import browser from "webextension-polyfill";

export async function loadCues(tabId: number, preference: Preference | null, notify: boolean = false) {
  if (!preference) {
    console.log("[dual-sub] profile isn't loaded on load alt sub.");
    preference = await grabAndHandleProfile(tabId);
  }
  const cues = await loadAltSubtitles(() => console.log(`[dual-sub] alt cues loaded for tab ${tabId}`), tabId, preference);
  setAltCues(tabId, cues, (await browser.tabs.get(tabId)).url!);
  if (notify) notifyCueRefresh(tabId, cues);
  return cues;
}

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

async function loadAltSubtitles(callback: CallableFunction, tabId: number, preference: Preference): Promise<Cue[]> {
  console.log("[dual-sub] begin load alt subs");
  const subOptions = getSubChoices(tabId)!;
  const altSub: Subtitle = preference.doCc ? subOptions.ccs : subOptions.subs;
  const sub = altSub[preference.subLanguage];
  if (!sub || !sub.url) {
    console.warn("[dual-sub] alternate subtitle is none");
    return [];
  }
  const cues = await fetchAndParseSubtitle(sub.url);
  console.log(preference)
  console.log(`[dual-sub] loaded ${cues.length} alternate cues from ${sub.language} ${preference.doCc ? "[CC]" : ""}`);
  callback();
  return cues;
}

export interface Preference {
  doCc: boolean,
  subLanguage: string
}