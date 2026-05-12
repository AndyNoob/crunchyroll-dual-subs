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

export function getAudio(tabId: number) {
  return audioMap.get(tabId);
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

export function setEpisodeManifest(tabId: number, opt: EpisodeManifest) {
  manifestMap.set(tabId, opt);
}

const manifestMap = new Map<number, EpisodeManifest>();
export const cueMap = new Map<number, Cue[]>();
const urlMap = new Map<number, string>();
const audioMap = new Map<number, string>();

export interface EpisodeManifest {
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