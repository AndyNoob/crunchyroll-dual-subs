import browser from "webextension-polyfill";
import {setAudio} from "../data/subtitles";
import {findHeaderValue, getOrLoadHeaders, type Header} from "../data/headers";
import {
  normalizeUrl,
  setNextRequestTime,
  singleFlight,
  sleep,
  waitUntil
} from "../utils";
import {type EpisodeManifest, getEpisodeManifest, setEpisodeManifest} from "../data/episode";
import {Logger} from "tslog";
import type {AudioLanguage} from "../shared";

const logger = new Logger({
  name: "episodeManifests"
});

export async function sendManifestRequest(contentId: string | undefined, headers: Header[]) {
  if (!contentId) return null;
  return await fetch(`https://www.crunchyroll.com/content/v2/cms/objects/${contentId}?dual_sub=676767`, {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
    } as Record<string, string>,
    credentials: "omit"
  });
}

export async function handleEpisodeManifest(tabId: number, response: any): Promise<EpisodeManifest> {
  const item = response?.data?.[0];
  const meta = item?.episode_metadata;

  setAudio(tabId, meta.audio_locale);
  logger.info(`audio locale for tab ${tabId} is ${meta.audio_locale}`);

  const manifest: EpisodeManifest = {
    url: normalizeUrl((await browser.tabs.get(tabId)).url ?? ""),
    episodeGuid: item.id as string,
    seasonGuid: meta.season_id as string,
    seriesId: meta.series_id as string,
    seriesTitle: meta.series_title as string,
    seasonTitle: meta.season_title as string,
    episodeTitle: item.title as string,
    audioLocale: meta.audio_locale as AudioLanguage,
    versions: (meta.versions ?? []).map((v: any) => ({
      audioLocale: v.audio_locale,
      guid: v.guid,
      seasonGuid: v.season_guid
    }))
  };
  setEpisodeManifest(tabId, manifest);
  return manifest;
}

const singleFlightGrab = (singleFlight(
  grabAndHandleManifest0,
  (tabId, _ = false) => tabId.toString()
));

export const grabEpisodeManifest = async (tabId: number) => {
  const existing = getEpisodeManifest(tabId);
  if (existing) return existing;
  const rawManifest = await browser.tabs.sendMessage(tabId, {type: "RAW_MANIFEST", reason: "grabEpisodeManifest"})
    .catch(e => {
      console.warn("[grab from content] failed to grab manifest from content", tabId, e);
      return null;
    });
  console.log("[grab from content] grabbed raw manifest from content", rawManifest);
  if (rawManifest) {
    return handleEpisodeManifest(tabId, rawManifest);
  }
  console.warn("[grabEpisodeManifest] resorting to API request", tabId);
  return singleFlightGrab(tabId);
};

async function getGuidByTabId(tabId: number): Promise<string | null> {
  const tab = await browser.tabs.get(tabId)
    .catch(e => {
      console.error("[get guid by tab id] failed to grab the tab", e);
    });
  if (!tab || !tab.url) return null;
  return tab.url.match(/watch\/([^/]+)\//)?.[1] || null;
}

async function grabAndHandleManifest0(tabId: number, refresh: boolean = false) {
  const l = logger.getSubLogger({
    name: "grabAndHandleManifest0"
  });
  if (!refresh) {
    const manifest = getEpisodeManifest(tabId);
    const currentGuid = await getGuidByTabId(tabId);
    if (currentGuid == undefined) {
      l.error("url guid not found.");
      return Promise.reject("can't find guid, gave up");
    }
    if (manifest && manifest.episodeGuid === currentGuid) {
      l.info("manifest already exists, not refreshing.");
      return manifest;
    }
  }
  let headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    l.error("headers not set")
    return Promise.reject("no auth");
  }

  const contentId = await getGuidByTabId(tabId);

  if (!contentId) {
    throw new Error("[grab and handle manifest inner] failed to get guid by tab id");
  }

  {
    const timeDiff = waitUntil - performance.now();
    if (timeDiff > 0) {
      l.info(`waiting ${timeDiff / 1000}s before fetch...`);
      await sleep(timeDiff);
    }
  }

  l.info(`fetching with content id ${contentId}...`);
  let response = null;

  try {
    response = await sendManifestRequest(contentId, headers);
  } catch (e) {
    l.warn("first fetch failed", e);
  }
  if (response && !response.ok) {
    l.warn(`got ${response.status}, trying to re-fetch after 3s...`);
    if (response.status === 401) {
      l.info("refreshing headers...");
      headers = await getOrLoadHeaders(tabId, true);
      if (!headers) {
        l.error("could not refresh header");
        return Promise.reject("[grabAndHandleManifest] could not refresh header");
      }
    }
    l.info("waiting 3s...");
    await sleep(3000);
    try {
      response = await sendManifestRequest(contentId, headers);
    } catch (e) {
      l.error("re-fetch failed", e);
    }
  }

  setNextRequestTime(performance.now() + 2000);

  if (!response || !response.ok) {
    l.error(`fetch failed with status ${response?.status}`, response);
    return Promise.reject("[grabAndHandleManifest] failed to grab sub choice");
  }

  return await handleEpisodeManifest(tabId, await response.json());
}
