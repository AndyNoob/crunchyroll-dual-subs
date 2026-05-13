import type {
  SubtitleCache,
  SubtitleCacheEntry,
  SubtitleManifest,
  SubtitleManifestCache,
} from "../../data/subtitles";
import browser from "webextension-polyfill";
import type {EpisodeManifest} from "../../data/episode";
import type {Preference} from "../../data/preferences";
import type {Cue} from "../../content";
import {Logger} from "tslog";

const logger = new Logger({
  name: "subtitleCache"
});

// thanks gpt-5.3/5.5
const cueCacheKey = "cr-dual-sub-subtitle-cache";
const manifestCacheKey = "cr-dual-sub-subtitle-manifest-cache";

const cacheTime = 3 * 24 * 60 * 60 * 1000; // three days

function emptyCacheEntry(): SubtitleCacheEntry {
  return {
    cachedAt: Date.now(),
    expiresAt: Date.now() + cacheTime,
    subs: {},
    ccs: {}
  };
}

function getBucket(entry: SubtitleCacheEntry, doCc: boolean) {
  return doCc ? entry.ccs : entry.subs;
}

export async function loadSubtitleCache(): Promise<SubtitleCache> {
  const result = await browser.storage.local.get(cueCacheKey);
  return (result[cueCacheKey] ?? {}) as SubtitleCache;
}

export async function saveSubtitleCache(cache: SubtitleCache) {
  await browser.storage.local.set({
    [cueCacheKey]: cache
  });
}

export async function loadSubtitleManifestCache(): Promise<SubtitleManifestCache> {
  const result = await browser.storage.local.get(
    manifestCacheKey
  );

  return (result[manifestCacheKey] ?? {}) as SubtitleManifestCache
}

export async function saveSubtitleManifestCache(cache: SubtitleManifestCache) {
  await browser.storage.local.set({
    [manifestCacheKey]: cache
  });
}

export async function getCachedSubtitleManifest(manifest: EpisodeManifest, ignoreStale = false)
  : Promise<SubtitleManifest | null> {
  const cache: SubtitleManifestCache = await loadSubtitleManifestCache();
  const entry = cache[manifest.episodeGuid];

  if (!entry) return null;
  if (!ignoreStale && Date.now() > entry.expiresAt) {
    logger.warn(`"${manifest.episodeTitle}" in sub manifest cache is stale`);
    entry.stale = true;
    cache[manifest.episodeGuid] = entry;
    await saveSubtitleManifestCache(cache);
    return null;
  }

  return entry.manifest;
}

export async function setCachedSubtitleManifest(
  epsManifest: EpisodeManifest,
  subManifest: SubtitleManifest
): Promise<void> {
  const cache: SubtitleManifestCache = await loadSubtitleManifestCache();
  let urls = [
    ...Object.values(subManifest.ccs).map(s => s.url),
    ...Object.values(subManifest.subs).map(s => s.url)
  ].filter(Boolean) as string[];

  if (urls.length === 0) {
    logger.error(`sub manifest for "${epsManifest.episodeTitle}" has no urls`);
    return;
  }

  const times = urls
    .map(timeUntilExpiry)
    .filter((t): t is number => t != null && t > 0);
  const time = times.length > 0
    ? Math.min(...times)
    : cacheTime;

  const entry = {
    cachedAt: Date.now(),
    expiresAt: Date.now() + time,
    manifest: {
      subs: subManifest.subs,
      ccs: subManifest.ccs
    },
    stale: false
  };
  logger.info(`cache time for sub manifest of "${epsManifest.episodeTitle}" is ${time}ms`, entry);
  cache[epsManifest.episodeGuid] = entry;

  await saveSubtitleManifestCache(cache);
}

function timeUntilExpiry(url: string | undefined): number | null {
  if (!url) return null;
  const t = new URL(url).searchParams.get("t");
  const exp = t?.match(/(?:^|~)exp=(\d+)(?:~|$)/)?.[1];
  return exp ? Number(exp) - Date.now() : null;
}

export async function getCachedCues(manifest: EpisodeManifest, pref: Preference): Promise<Cue[] | null> {
  const cache = await loadSubtitleCache();
  const entry = cache[manifest.episodeGuid];
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    delete cache[manifest.episodeGuid];
    await saveSubtitleCache(cache);
    logger.warn(`${manifest.episodeGuid} in cues cache expired`);
    return null;
  }

  return (
    getBucket(entry, pref.doCc)[pref.subLanguage] ?? null
  );
}

export async function setCachedCues(
  manifest: EpisodeManifest,
  pref: Preference,
  cues: Cue[]
): Promise<void> {
  const cache = await loadSubtitleCache();
  const entry =
    cache[manifest.episodeGuid]
    ?? emptyCacheEntry();

  entry.cachedAt = Date.now();
  entry.expiresAt = Date.now() + cacheTime;

  getBucket(entry, pref.doCc)[pref.subLanguage] = cues;
  cache[manifest.episodeGuid] = entry;

  logger.info(`new entry for "${manifest.episodeTitle}" added to cue cache`, entry);

  await saveSubtitleCache(cache);
}
