import {
  grabAndHandleSubChoices,
  handleSubChoice,
  handleProfile
} from "./subtitle/handler";
import browser from "webextension-polyfill";
import {
  getAltCues,
  getOrLoadHeaders,
  getSubChoices,
  notifyCueRefresh, resolvePreference,
  setHeaders, setPreference
} from "./subtitle/manager";
import {loadCues} from "./subtitle/loader";

console.log("[dual-sub] background loaded");

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
    notifyCueRefresh(tabId, await resolveCues(tabId, tab.url!));
  },
  {urls: ["*://www.crunchyroll.com/watch/*"], properties: ["url"]}
);

async function resolveCues(tabId: number, url: string) {
  let altCues = getAltCues(tabId, url);
  if (!altCues || altCues.length === 0) {
    console.log("[dual-sub] playback is undefined/wrong upon request, grabbing...");
    const headers = getOrLoadHeaders(tabId);
    if (!headers) {
      console.log("[dual-sub] headers not set");
      return Promise.reject("auth data not found.");
    }
    await grabAndHandleSubChoices(tabId);
    const preference = await resolvePreference(tabId);
    altCues = await loadCues(tabId, preference, false);
    console.log(`[dual-sub] grabbed ${altCues?.length} cues upon request`);
  }
  return altCues;
}

function receiveProfileOrPlayback(details: { tabId: number; url: string | string[]; requestId: string; }) {
  if (details.tabId < 0) return;
  const isProfile = details.url.includes("/me/multiprofile");
  if (!(details.url.includes(".com/playback/v3") || isProfile)) return;

  console.log(`[dual-sub] received ${isProfile ? "profile" : "playback"} request with id ${details.requestId}`);

  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");

  let data = "";

  filter.ondata = (e) => {
    const decoded = decoder.decode(e.data);
    data += decoded;
    filter.write(e.data);
  }

  filter.onstop = async () => {
    console.log(`[dual-sub] finishing request id ${details.requestId}`);
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn(`[dual-sub] request id ${details.requestId} is extraneous`);
      console.log(data);
      filter.disconnect();
      return;
    }

    filter.disconnect();

    try {
      if (isProfile) handleProfile(parsed, details.tabId);
      else await handleSubChoice(parsed, details.tabId);
      console.log(`[dual-sub] processed ${isProfile ? "profiles" : "playback"} data on tab ${details.tabId}`);
    } catch (err) {
      console.error("[dual-sub] processing failed:", err);
    }
  }
}

async function receiveContentMsg(msg: any, sender: any) {
  const isValid = sender.tab && sender.tab.id && sender.tab.id >= 0;
  const tabId: number = sender.tab!.id!;
  const url: string = sender.tab!.url!;
  if (!isValid) return Promise.reject();
  if (msg?.type === "GET_CUES") {
    return await resolveCues(tabId, url);
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
  if (setHeaders(details.tabId, details.requestHeaders))
    console.log(`[dual-sub] headers set for tab ${details.tabId} based off of ${details.url}`);
}
