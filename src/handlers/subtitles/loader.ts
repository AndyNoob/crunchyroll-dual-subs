import type {Preference} from "../../data/preferences";
import {type CachedCues, type SubtitleManifest, type Subtitles} from "../../data/subtitles";
import browser from "webextension-polyfill";
import {getPlaybackBlockedUntil, markPlaybackBlocked} from "../manager";

import {getOrFail, singleFlight, sleep} from "../../utils";
import {grabEpisodeManifest} from "../episode";
import {findHeaderValue, getOrLoadHeaders, type Header} from "../../data/headers";
import {Logger} from "tslog";
import {getCachedCues, getCachedSubtitleManifest, setCachedCues, setCachedSubtitleManifest} from "./cacher";
import type {EpisodeManifest} from "../../data/episode";

const logger = new Logger({
  name: "subtitleLoader"
});

export const grabCues = singleFlight(
  grabCues0,
  (tabId: number, preference: Preference, _ = false) =>
    `${tabId}-${preference.subLanguage}-${preference.doCc}`
)

export async function grabCues0(tabId: number, preference: Preference, refresh = false) {
  const manifest = await grabEpisodeManifest(tabId);
  if (!refresh) {
    const cached = await getCachedCues(manifest, preference);
    if (cached && cached.content && cached.format) {
      logger.info(`using cached cues`);
      return cached;
    }
    logger.info("cache not found, begin loading cues...");
  } else {
    logger.warn("cue refresh requested...");
  }
  const cues = await loadSubtitles(tabId, preference);
  await setCachedCues(manifest, preference, cues);
  return cues;
}

async function loadSubtitles(tabId: number, pref: Preference): Promise<CachedCues> {
  logger.info("begin load subs");
  const manifest = await grabSubtitleManifest(tabId);
  let subtitles = (pref.doCc ? manifest.ccs : manifest.subs);
  let subtitle = subtitles[pref.subLanguage];
  if (!subtitle) {
    logger.warn("requested subtitle not found in manifest, selecting first", pref);
    let keys = Object.keys(subtitles);
    if (keys.length === 0) {
      subtitles = pref.doCc ? manifest.subs : manifest.ccs;
      keys = Object.keys(subtitles);
    }
    subtitle = subtitles[keys[0]!];
    if (!subtitle) {
      logger.warn("there are none in preferred subtitle type", pref);
      return Promise.reject("can't find it, gave up");
    }
  }
  if (!subtitle.url) {
    if (subtitle.language === "none") {
      return {format: "none", content: ""} as CachedCues;
    } else {
      logger.error("subtitle doesn't have a url yet isn't 'none'", subtitle);
      return Promise.reject("no url, gave up");
    }
  }
  return {content: await fetchAndParseSubtitle(tabId, subtitle.url), format: subtitle.format ?? "unknown"};
}

const device = __BROWSER_TYPE__; // apparently the allowed values are phone,tablet,android_tv,firefox,chrome
const deviceType = "web";

export async function grabSubtitleManifest(tabId: number, refresh = false, isRetry = false): Promise<SubtitleManifest> {
  const manifest = await grabEpisodeManifest(tabId);
  if (!refresh) {
    const cached = await getCachedSubtitleManifest(manifest);
    if (cached != null) {
      logger.info("using cached sub manifest");
      return cached;
    }
    logger.info("manifest cache not found, begin loading cues...");
  } else {
    logger.warn("manifest refresh requested...");
  }
  const response = await sendManifestRequest(
    (await grabEpisodeManifest(tabId)).episodeGuid,
    deviceType,
    device,
    await getOrFail("headers", getOrLoadHeaders, tabId),
    (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string
  );
  if ((!response || !response.ok)) {
    if (response?.status === 420) {
      markPlaybackBlocked();

      await browser.tabs.sendMessage(tabId, {
        type: "PLAYBACK_BLOCKED",
        blockedUntil: getPlaybackBlockedUntil()
      }).catch(() => {});
      await browser.runtime.sendMessage({
        type: "PLAYBACK_BLOCKED",
        blockedUntil: getPlaybackBlockedUntil()
      }).catch(() => {});
      return Promise.reject("stream limited, gave up");
    }
    if (isRetry) {
      logger.error("failed to grab subtitle manifest", response);
      return Promise.reject(`failed to grab subtitle manifest, code ${response?.status}`);
    } else {
      logger.warn("failed to grab subtitle manifest, retrying in 3s...", response);
      await sleep(3000);
      return await grabSubtitleManifest(tabId, true, true);
    }
  }
  const playback = await response.json();
  return await handleSubtitleManifest(manifest, playback);
}

export async function handleSubtitleManifest(manifest: EpisodeManifest, playback: any) {
  const ccs: Subtitles = playback["captions"];
  const subs: Subtitles = playback["subtitles"];
  const subManifest = {
    ccs,
    subs
  };
  await setCachedSubtitleManifest(manifest, subManifest);
  return subManifest;
}

async function fetchAndParseSubtitle(tabId: number, url: string): Promise<string> {
  logger.info(`fetching sub from ${url}`);
  const raw = (await browser.tabs.sendMessage(tabId, {type: "FETCH_SUBTITLE", url})) as string;
  if (raw.length === 0) {
    logger.error("subtitle request returned empty.");
    return "";
  }
  return raw;
}

async function sendManifestRequest(contentId: string | undefined, deviceType: string, device: string, headers: Header[], crTabId: string) {
  if (!contentId) return null;
  console.log(`[grabAndHandleManifest] cr-tab-id is ${crTabId}`);
  return await fetch(`https://www.crunchyroll.com/playback/v3/${contentId}/${deviceType}/${device}/play?dual_sub=676767`, {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
      "x-cr-tab-id": crTabId
    } as Record<string, string>,
    credentials: "omit"
  });
}