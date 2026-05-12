import type {Cue} from "../content";
import {normalizeUrl} from "../handlers/manager";

export function getEpisodeManifest(tabId: number): EpisodeManifest | undefined {
  return manifestMap.get(tabId);
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

export function findSeasonGuid(tabId: number) {
  const manifest = getEpisodeManifest(tabId);
  if (!manifest) return null;
  const audio = getAudio(tabId);
  for (let version of manifest.versions) {
    if (version.audioLocale !== audio) continue;
    return version.seasonGuid;
  }
  return null;
}

export function findGuid(tabId: number) {
  const manifest = getEpisodeManifest(tabId);
  if (!manifest) return null;
  const audio = getAudio(tabId);
  for (let version of manifest.versions) {
    if (version.audioLocale !== audio) continue;
    return version.guid;
  }
  return null;
}

export function getAudio(tabId: number) {
  return audioMap.get(tabId);
}

export function setAltCues(tabId: number, cues: Cue[], url: string) {
  cueMap.set(tabId, cues);
  const value = normalizeUrl(url);
  urlMap.set(tabId, value);
  (globalThis as any)["dualSubs"] = (globalThis as any)["dualSubs"] ?? {};
  (globalThis as any)["dualSubs"].cues = cueMap;
}

export function setAudio(tabId: number, audio: string) {
  console.log(`[setAudio] new audio is ${audio}`)
  audioMap.set(tabId, audio);
}

export function setEpisodeManifest(tabId: number, opt: EpisodeManifest) {
  manifestMap.set(tabId, opt);
  (globalThis as any)["dualSubs"] = (globalThis as any)["dualSubs"] ?? {};
  (globalThis as any)["dualSubs"].manifests = manifestMap;
}

export function mapVersion(versions: any[]): EpisodeVersion[] {
  return (versions as EpisodeVersionRaw[]).map(v => {
    return {
      audioLocale: v.audio_locale,
      guid: v.guid,
      seasonGuid: v.season_guid
    } as EpisodeVersion
  });
}

export const manifestMap = new Map<number, EpisodeManifest>();
export const cueMap = new Map<number, Cue[]>();
const urlMap = new Map<number, string>();
const audioMap = new Map<number, string>();

export interface EpisodeManifest {
  url: string,
  ccs: Subtitles,
  subs: Subtitles,
  versions: EpisodeVersion[]
}

export interface Subtitles {
  [key: string]: {
    language: string,
    format?: string,
    url?: string
  }
}

export interface EpisodeVersion {
  audioLocale: string,
  seasonGuid: string,
  guid: string
}

interface EpisodeVersionRaw {
  audio_locale: string,
  season_guid: string,
  guid: string
}
