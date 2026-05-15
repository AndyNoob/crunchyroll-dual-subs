export function getAudio(tabId: number) {
  return audioMap.get(tabId);
}

export function setAudio(tabId: number, audio: string) {
  console.log(`[setAudio] new audio is ${audio}`)
  audioMap.set(tabId, audio);
}

const audioMap = new Map<number, string>();

export interface SubtitleManifest {
  ccs: Subtitles,
  subs: Subtitles,
}

export interface Subtitles {
  [key: string]: {
    language: string,
    format?: string,
    url?: string
  }
}

export interface SubtitleCacheEntry {
  cachedAt: number,
  expiresAt: number,
  subs: Record<string, CachedCues>,
  ccs: Record<string, CachedCues>,
}

export interface CachedCues {
  content: string,
  format: string,
}

export type SubtitleCache = Record<string, SubtitleCacheEntry>; // episodeGuid -> entry

export type SubtitleManifestCache = Record<string, SubtitleManifestCacheEntry>;

export interface SubtitleManifestCacheEntry {
  cachedAt: number,
  expiresAt: number,
  manifest: SubtitleManifest,
  stale: boolean
}