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

const logger = new Logger({
  name: "episodeManifests"
});

export async function handleManifestAndAudio(response: any, tabId: number): Promise<EpisodeManifest> {
  const item = response?.data?.[0];
  const meta = item?.episode_metadata;

  setAudio(tabId, meta.audio_locale);
  logger.info(`audio locale for tab ${tabId} is ${response["audio_locale"]}`);

  const manifest: EpisodeManifest = {
    url: normalizeUrl((await browser.tabs.get(tabId)).url ?? ""),
    episodeGuid: item.id as string,
    seasonGuid: meta.season_id as string,
    seriesId: meta.series_id as string,
    seriesTitle: meta.series_title as string,
    seasonTitle: meta.season_title as string,
    episodeTitle: item.title as string,
    versions: (meta.versions ?? []).map((v: any) => ({
      audioLocale: v.audio_locale,
      guid: v.guid,
      seasonGuid: v.season_guid
    }))
  };
  setEpisodeManifest(tabId, manifest);
  return manifest;
}

export const grabEpisodeManifest = singleFlight(
  grabAndHandleManifest0,
  (tabId, _ = false) => tabId.toString()
);

async function grabAndHandleManifest0(tabId: number, refresh: boolean = false) {
  const l = logger.getSubLogger({
    name: "grabAndHandleManifest0"
  });
  if (!refresh) {
    const manifest = getEpisodeManifest(tabId);
    if (manifest) {
      l.info("manifest already exists, not refreshing.");
      return manifest;
    }
  }
  let headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    l.error("headers not set")
    return Promise.reject("no auth");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (!url) {
    l.info("url not found, aborting");
    return Promise.reject(`could not find url of tab ${tabId}`);
  }
  const contentId = url.match(/crunchyroll\.com\/watch\/(.+)\//)![1];

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
    const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
    response = await sendManifestRequest(contentId, headers, crTabId);
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
      const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
      response = await sendManifestRequest(contentId, headers, crTabId);
    } catch (e) {
      l.error("re-fetch failed", e);
    }
  }

  setNextRequestTime(performance.now() + 2000);

  if (!response || !response.ok) {
    l.error(`fetch failed with status ${response?.status}`, response);
    return Promise.reject("[grabAndHandleManifest] failed to grab sub choice");
  }

  return await handleManifestAndAudio(await response.json(), tabId);
}

export async function sendManifestRequest(contentId: string | undefined, headers: Header[], crTabId: string) {
  if (!contentId) return null;
  logger.info(`cr-tab-id is ${crTabId}`);
  return await fetch(`https://www.crunchyroll.com/content/v2/cms/objects/${contentId}?dual_sub=676767`, {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
    } as Record<string, string>,
    credentials: "omit"
  });
}