import type {Cue} from "../content";
import {normalizeUrl, notifyCueRefresh, setNextRequestTime, sleep, waitUntil} from "./manager";
import {parseSubs} from "frazy-parser";
import {grabAndHandleProfile} from "./profiles";
import browser from "webextension-polyfill";
import {shortenUrl} from "../background";
import {
  type EpisodeManifest,
  getEpisodeManifest, mapVersion,
  setAltCues,
  setAudio,
  setEpisodeManifest,
  type Subtitles
} from "../data/subtitles";
import {findHeaderValue, getOrLoadHeaders, type Header} from "../data/headers";

import type {Preference} from "../data/preferences";

export async function loadCues(tabId: number, preference: Preference | null, notify: boolean = false) {
  if (!preference) {
    console.log("[loadCues] profile isn't loaded on load alt sub.");
    preference = await grabAndHandleProfile(tabId);
  }
  console.log("[loadCues] begin loading cues");
  const cues = await loadAltSubtitles(() => console.log(`[loadCues] alt cues loaded for tab ${tabId}`), tabId, preference);
  setAltCues(tabId, cues, (await browser.tabs.get(tabId)).url!);
  if (notify) notifyCueRefresh(tabId, cues);
  return cues;
}

export async function fetchAndParseSubtitle(tabId: number, url: string): Promise<Cue[]> {
  console.log(`[fetchAndParseSubtitle] fetching sub from ${url}`);
  const raw = (await browser.tabs.sendMessage(tabId, {type: "FETCH_SUBTITLE", url})) as string;
  if (raw.length === 0) {
    console.log("[fetchAndParseSubtitle] subtitle request returned empty.");
    return [];
  }
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
  return parsed.map((cue: any) => ({
    id: cue.id,
    start: cue.start,
    end: cue.end,
    text: (cue.body || [])
      .map((part: any) => cleanSubtitleText(part.text || ""))
      .join("\n")
      .trim()
  }));
}

export async function handleManifestAndAudio(playback: any, tabId: number): Promise<EpisodeManifest> {
  const ccs: Subtitles = playback["captions"];
  const subs: Subtitles = playback["subtitles"];
  console.log(`[handleManifestAndAudio] audio locale for tab ${tabId} is ${playback["audioLocale"]}`);
  setAudio(tabId, playback["audioLocale"]);
  const manifest: EpisodeManifest = {
    url: normalizeUrl((await browser.tabs.get(tabId)).url!),
    versions: mapVersion(playback["versions"]),
    ccs,
    subs,
  };
  setEpisodeManifest(tabId, manifest);
  return manifest;
}

export async function grabAndHandleManifest(tabId: number, refresh: boolean = false) {
  if (!refresh) {
    const manifest = getEpisodeManifest(tabId);
    if (manifest) return manifest;
  }
  let headers = await getOrLoadHeaders(tabId);
  if (!headers) {
    console.log("[grabAndHandleManifest] headers not set")
    return Promise.reject("no auth");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (!url) {
    console.log("[grabAndHandleManifest] url not found, aborting");
    return Promise.reject(`could not find url of tab ${tabId}`);
  }
  const contentId = url.match(/crunchyroll\.com\/watch\/(.+)\//)![1];
  const device = "firefox"; // phone,tablet,android_tv,firefox,chrome
  const deviceType = "web";
  console.log("[grabAndHandleManifest] fetching...");
  // courtesy of https://github.com/Crunchyroll-Plus/crunchyroll-docs/blob/release/Services/Play/GET/getPlayStream.md
  let response = null;
  await sleep(1600); // always sleep to try and mitigate 420 stream limits
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  try {
    const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
    response = await sendManifestRequest(contentId, deviceType, device, headers, crTabId);
  } catch (e) {
    console.warn("[grabAndHandleManifest] first fetch failed", e);
  }
  if (response && !response.ok) {
    console.warn(`[grabAndHandleManifest] got ${response.status}, trying to re-fetch after 3s...`);
    if (response.status === 401) {
      console.log("[grabAndHandleManifest] refreshing headers...");
      headers = await getOrLoadHeaders(tabId, true);
      if (!headers) {
        console.log("[grabAndHandleManifest] could not refresh header");
        return Promise.reject("[grabAndHandleManifest] could not refresh header");
      }
    }
    await sleep(3000);
    try {
      const crTabId = (await browser.tabs.sendMessage(tabId, {type: "TAB_ID"})) as string;
      response = await sendManifestRequest(contentId, deviceType, device, headers, crTabId);
    } catch (e) {
      console.error("[grabAndHandleManifest] re-fetch failed", e);
    }
  }
  setNextRequestTime(performance.now() + 5000);
  if (!response || !response.ok) {
    console.error(`[grabAndHandleManifest] fetch failed with status ${response?.status}`, response);
    return Promise.reject("[grabAndHandleManifest] failed to grab sub choice");
  }
  return await handleManifestAndAudio(await response.json(), tabId);
}

async function loadAltSubtitles(callback: CallableFunction, tabId: number, preference: Preference): Promise<Cue[]> {
  console.log("[loadAltSubtitles] begin load alt subs");
  let manifest = getEpisodeManifest(tabId) || await grabAndHandleManifest(tabId);
  if (!manifest) {
    console.error("[loadAltSubtitles] sub choices not found");
    return Promise.reject("[loadAltSubtitles] sub choices not found");
  }
  const url = (await browser.tabs.get(tabId)).url;
  if (manifest.url !== url) {
    console.log(`[loadAltSubtitles] updating from old manifest ${shortenUrl(manifest.url)} to ${shortenUrl(url!)}`);
    manifest = await grabAndHandleManifest(tabId, true);
  }
  const altSub: Subtitles = preference.doCc ? manifest.ccs : manifest.subs;
  const sub = altSub[preference.subLanguage];
  if (!sub || !sub.url) {
    console.warn("[loadAltSubtitles] alternate subtitle is none");
    return [];
  }
  const cues = await fetchAndParseSubtitle(tabId, sub.url);
  console.log(preference)
  console.log(`[loadAltSubtitles] loaded ${cues.length} alternate cues from ${sub.language} ${preference.doCc ? "[CC]" : ""}`);
  callback();
  return cues;
}

export async function sendManifestRequest(contentId: string | undefined, deviceType: string, device: string, headers: Header[], crTabId: string) {
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