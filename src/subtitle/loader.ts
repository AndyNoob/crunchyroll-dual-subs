import {fetchAndParseSubtitle, profile, subOptions} from "./handler";
import type {Subtitle} from "./handler";
import type {Cue} from "../content";

export async function loadAltSubtitles(callback: CallableFunction): Promise<Cue[]> {
  console.log("[dual-sub] begin load alt subs");
  const altSub: Subtitle = profile.preferCc ? subOptions.subs : subOptions.ccs;
  const sub = altSub[profile.subLanguage];
  const cues = await fetchAndParseSubtitle(sub.url);
  console.log(`[dual-sub] loaded ${cues.length} alternate cues from ${sub.language} ${profile.preferCc ? "[CC]" : ""}`);
  callback();
  return Promise.resolve(cues);
}