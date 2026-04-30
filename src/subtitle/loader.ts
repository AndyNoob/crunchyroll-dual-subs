import {fetchAndParseSubtitle} from "./handler";
import type {Cue} from "../content";
import {getProfile, getSubOpt, type Subtitle} from "./manager";

export async function loadAltSubtitles(callback: CallableFunction, tabId: number): Promise<Cue[]> {
  console.log("[dual-sub] begin load alt subs");
  const subOptions = getSubOpt(tabId)!;
  const profile = getProfile(tabId)!;
  const altSub: Subtitle = profile.preferCc ? subOptions.subs : subOptions.ccs;
  const sub = altSub[profile.subLanguage];
  if (!sub || !sub.url) {
    console.warn("[dual-sub] alternate subtitle is not valid");
    return Promise.reject("no valid subtitles found");
  }
  const cues = await fetchAndParseSubtitle(sub.url);
  console.log(`[dual-sub] loaded ${cues.length} alternate cues from ${sub.language} ${profile.preferCc ? "[CC]" : ""}`);
  callback();
  return Promise.resolve(cues);
}