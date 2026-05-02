import {
  grabAndHandleSubChoices,
  handleSubChoice,
  handleProfile
} from "./subtitle/handler";
import browser, {type WebRequest} from "webextension-polyfill";
import {
  getAltCues,
  getAudio,
  getOrLoadHeaders,
  getSubChoices,
  notifyCueRefresh, resolvePreference,
  setHeaders, setPreference
} from "./subtitle/manager";
import {loadCues} from "./subtitle/loader";

console.log("[dual-sub] background loaded");

let shouldRefresh: boolean = false;

browser.webRequest.onBeforeRequest.addListener(
  receiveProfileOrPlayback,
  {urls: ["*://www.crunchyroll.com/*"]},
  ["blocking"]
);

browser.runtime.onMessage.addListener(receiveContentMsg);
browser.webRequest.onSendHeaders.addListener(
  receiveAuthHeaders,
  {urls: ["*://www.crunchyroll.com/*"]},
  ["requestHeaders"]
);
browser.tabs.onUpdated.addListener(
  async (tabId, _, tab) => {
    console.log(`new tab url for tab ${tabId} is ${tab.url}`);
    shouldRefresh = true;
  },
  {urls: ["*://www.crunchyroll.com/watch/*"], properties: ["url"]}
);

/**
 * @param tabId id of the tab requesting cue resolution
 * @param url url of the tab requesting cue resolution
 * @param audio audio locale of the tab requesting cue resolution
 */
async function resolveCues(tabId: number, url: string, audio: string | null) {
  let altCues = getAltCues(tabId, url, audio);
  if (altCues === null || altCues === undefined) {
    console.log("[resolveCues] alt subs are undefined/wrong upon request, grabbing...");
    const headers = getOrLoadHeaders(tabId);
    if (!headers) {
      console.log("[resolveCues] headers not set");
      return Promise.reject("auth data not found.");
    }
    const preference = await resolvePreference(tabId);
    altCues = await loadCues(tabId, preference, false);
    console.log(`[resolveCues] grabbed ${altCues?.length} cues upon request`);
  }
  return altCues;
}

function receiveProfileOrPlayback(details: WebRequest.OnBeforeRequestDetailsType) {
  if (details.tabId < 0) return;
  if (details.url.includes("?dual_sub=676767")) return;
  const isProfile = details.url.includes("/me/multiprofile");
  if (!(details.url.includes(".com/playback/v3") || isProfile)) return;

  console.log(`[receiveProfileOrPlayback] received ${isProfile ? "profile" : "playback"} request with id ${details.requestId}`);

  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");

  let data = "";

  filter.ondata = (e) => {
    const decoded = decoder.decode(e.data);
    data += decoded;
    filter.write(e.data);
  }

  filter.onstop = async () => {
    console.log(`[receiveProfileOrPlayback] finishing request id ${details.requestId}`);
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn(`[receiveProfileOrPlayback] request id ${details.requestId} is extraneous`);
      console.log(data);
      filter.disconnect();
      return;
    }

    filter.disconnect();

    try {
      if (isProfile) handleProfile(parsed, details.tabId);
      else {
        await handleSubChoice(parsed, details.tabId);
        if (shouldRefresh) {
          shouldRefresh = false;
          console.log("[receiveProfileOrPlayback] refresh triggered")
          notifyCueRefresh(details.tabId, await resolveCues(details.tabId, details.documentUrl!, getAudio(details.tabId) || null))
        }
      }
      console.log(`[receiveProfileOrPlayback] processed ${isProfile ? "profiles" : "playback"} data on tab ${details.tabId}`);
    } catch (err) {
      console.error("[receiveProfileOrPlayback] processing failed:", err);
    }
  }
}

async function receiveContentMsg(msg: any, sender: any) {
  const isValid = sender.tab && sender.tab.id && sender.tab.id >= 0;
  const tabId: number = sender.tab!.id!;
  const url: string = sender.tab!.url!;
  if (!isValid) return Promise.reject();
  if (msg?.type === "GET_CUES") {
    return await resolveCues(tabId, url, getAudio(tabId) ?? null);
  }
  if (msg?.type === "GET_CHOICES") {
    let subChoices = getSubChoices(tabId);
    if (!subChoices) subChoices = await grabAndHandleSubChoices(tabId);
    return subChoices;
  }
  if (msg?.type === "GET_PREFERENCE") {
    return await resolvePreference(tabId);
  }
  if (msg?.type === "SET_PREFERENCE") {
    return await setPreference(tabId, msg.pref!);
  }
  if (msg?.type === "REFRESH_TAB") {
    return browser.tabs.reload(tabId);
  }
}

async function receiveAuthHeaders(details: any) {
  if (details.tabId < 0) return;
  if (details.requestHeaders === undefined) return;
  setHeaders(details.tabId, details.requestHeaders);
    // console.log(`[dual-sub] headers set for tab ${details.tabId} based off of ${details.url}`);
}
