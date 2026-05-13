
export function getEpisodeManifest(tabId: number): EpisodeManifest | undefined {
  return manifestMap.get(tabId);
}

export function findSeasonGuid(tabId: number) {
  const manifest = getEpisodeManifest(tabId);
  if (!manifest) return null;
  return manifest.seasonGuid;
}

export function findEpisodeGuid(tabId: number) {
  const manifest = getEpisodeManifest(tabId);
  if (!manifest) return null;
  return manifest.episodeGuid;
}

export function setEpisodeManifest(tabId: number, opt: EpisodeManifest) {
  manifestMap.set(tabId, opt);
  (globalThis as any)["dualSubs"] = (globalThis as any)["dualSubs"] ?? {};
  (globalThis as any)["dualSubs"].manifests = manifestMap;
}

export const manifestMap = new Map<number, EpisodeManifest>();

export interface EpisodeManifest {
  url: string,
  episodeGuid: string,
  seasonGuid: string,
  seriesId: string,
  seriesTitle: string,
  seasonTitle: string,
  episodeTitle: string,
  versions: EpisodeVersion[],
}

export interface EpisodeVersion {
  audioLocale: string,
  seasonGuid: string,
  guid: string
}