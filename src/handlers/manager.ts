import type {Cue} from "../content";
import browser from "webextension-polyfill";
import {profileMap} from "../data/profiles";
import {cueMap} from "../data/subtitles";

export function normalizeUrl(url: string) {
  const normalized = new URL(url);
  normalized.search = '';
  normalized.hash = '';
  return normalized.toString();
}

(globalThis as any)["dualSubs"] = {
  cueMap,
  profileMap
};

export function notifyCueRefresh(tabId: number, cues: Cue[], attemptsLeft = 3) {
  if (attemptsLeft <= 0) return;
  browser.tabs.sendMessage(tabId, {
    type: "REFRESH_CUES",
    cues: cues
  }).catch(e => {
    console.warn("[notifyCueRefresh] failed to notify cue refresh", e);
    setTimeout(() => {
      notifyCueRefresh(tabId, cues, --attemptsLeft);
    }, 5000);
  }).then(() => console.log(`[notifyCueRefresh] sent refresh cue to tab ${tabId}`));
}

export let waitUntil: number = 0;

export function setNextRequestTime(val: number) {
  waitUntil = val;
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}