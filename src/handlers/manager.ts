import browser from "webextension-polyfill";
import type {Format, Track, Tracks} from "../content";
import {grabSelectedProfile} from "./profiles";
import {resolvePreference} from "./preferences";
import {grabEpisodeManifest} from "./episode";
import {getProfile} from "../data/profiles";
import {findEpisodeGuid, findSeasonGuid, getEpisodeManifest} from "../data/episode";
import {grabCues} from "./subtitles/loader";
import type {Preference} from "../data/preferences";

export function notifyCueRefresh(tabId: number, cues: Tracks, attemptsLeft = 3) {
  if (attemptsLeft <= 0) return;
  browser.tabs.sendMessage(tabId, {
    type: "REFRESH_CUES",
    cues: cues,
    guid: getEpisodeManifest(tabId)?.episodeGuid
  }).catch(e => {
    console.warn("[notifyCueRefresh] failed to notify cue refresh", e);
    setTimeout(() => {
      notifyCueRefresh(tabId, cues, --attemptsLeft);
    }, 5000);
  }).then(() => {
    console.log(`[notifyCueRefresh] sent refresh cue to tab ${tabId}`);
    browser.runtime.sendMessage({type: "REFRESH_POPUP"}).catch(e => console.error(e));
  });
}

export async function bundleCues(tabId: number, refresh = false) {
  const profile = await grabSelectedProfile(tabId);
  const tracks: Tracks = {};
  if (profile.doCc) {
    // no need to force soft subbing
    console.log("[receiveContentMsg] GET_CUES: only grabbing CC");
    const track = await resolveCues(tabId, refresh);
    tracks[track.lang] = track;
  } else {
    console.log("[receiveContentMsg] GET_CUES: forcing soft sub");
    const trackSecondary = await resolveCues(tabId, refresh);
    const trackInPlayer = await resolveCues(tabId, refresh, profile);
    tracks[trackInPlayer.lang] = trackInPlayer;
    tracks[trackSecondary.lang] = trackSecondary;
  }
  return tracks;
}

/**
 * @param tabId id of the tab requesting cue resolution
 * @param refresh refreshes the cache
 * @param pref preference override
 */
export async function resolveCues(tabId: number, refresh = false, pref: Preference | null = null): Promise<Track> {
  console.log("[resolveCues] resolution began...");
  await grabEpisodeManifest(tabId);
  const preference = pref ?? await resolvePreference(
    getProfile(tabId) ?? await grabSelectedProfile(tabId),
    findSeasonGuid(tabId)!,
    findEpisodeGuid(tabId)!
  );
  const cues = await grabCues(tabId, preference, refresh);
  if (!cues) {
    return {format: "none", lang: "none", content: ""};
  }
  return {
    format: cues.format as Format,
    lang: `${preference.subLanguage}-${preference.doCc ? "cc" : "sub"}`,
    content: cues.content
  };
}

let playbackBlockedUntil = 0;

export function markPlaybackBlocked(ms = 3 * 60 * 1000) {
  playbackBlockedUntil = Date.now() + ms;
}

export function getPlaybackBlockedUntil() {
  return playbackBlockedUntil > Date.now()
    ? playbackBlockedUntil
    : 0;
}

export async function getToken(tabId: number): Promise<string | null> {
  const ss = await browser.tabs.sendMessage(tabId, {type: "SEND_TOKEN"}).catch(e => {
    console.warn("[get token] failed", e);
    return null;
  }) as string | null;
  const s = "Bearer " + ss;
  if (ss) return s;

  return null;
}