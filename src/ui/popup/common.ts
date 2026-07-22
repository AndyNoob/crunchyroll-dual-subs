import type {Profile} from "../../data/profiles";
import type {SubtitleManifest} from "../../data/subtitles";
import browser from "webextension-polyfill";
import {tabId} from "./scoped-options";

export type ContextResponse = {
  seasonGuid?: string;
  episodeGuid?: string;
  currentProfile: Profile;
};

export async function send<T>(msg: Record<string, unknown>): Promise<T | null> {
  return await browser.runtime.sendMessage({
    ...msg,
    tabId
  }).catch((e) => {
    console.error("[dual sub popup] failed to send message", e);
    return null;
  }) as T | null;
}

export async function grabManifest() {
  return (await send({type: "GET_MANIFEST"}).catch(r => console.warn(r))) as SubtitleManifest;
}

export async function getActiveCrunchyrollTabId(): Promise<number> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id || !tab.url?.includes("crunchyroll.com")) {
    throw new Error("Open this popup on a Crunchyroll tab.");
  }

  return tab.id;
}

