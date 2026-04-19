import {parseSubs} from "frazy-parser";
import type {Cue} from "./content";
import {loadAltSubtitles} from "./subtitle-loader";

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

export let subOptions: {ccs: Subtitle, subs: Subtitle};
export let profile: Profile;
export let altCues: Cue[];

export function handlePlayback(playback) {
  const ccs: Subtitle = playback["captions"];
  const subs: Subtitle = playback["subtitles"];
  subOptions = {ccs, subs}
  loadAltSubtitles(() => console.log("[dual-sub] alt sub loaded")).then(r => altCues = r);
}

export function handleProfile(data) {
  const profiles: Profile[] = (data?.["profiles"] as [RawProfile]).map(a => mapProfile(a));
  let selected: Profile;
  for (let profile: Profile of profiles) {
    if (profile.isSelected) {
      selected = profile;
      break;
    }
  }

  profile = selected;
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

export enum SubType {
  Cc = "cc",
  Sub = "sub",
  Unknown = null
}