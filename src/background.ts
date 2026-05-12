import browser, {type Runtime, type WebRequest} from "webextension-polyfill";
import {getOrLoadHeaders, setHeaders} from "./data/headers";
import {findGuid, findSeasonGuid, getAltCues, getAudio, getEpisodeManifest} from "./data/subtitles";
import {notifyCueRefresh, setNextRequestTime} from "./handlers/manager";
import {
  grabAndHandleProfile,
  handleProfile
} from "./handlers/profiles";
import {grabAndHandleManifest, handleManifestAndAudio, loadCues} from "./handlers/subtitles";
import {resolvePreference, setPreference} from "./handlers/preferences";
import {getProfile} from "./data/profiles";

console.log("[dual-sub] background loaded");

let shouldRefresh: boolean = false;
if (__BROWSER_TYPE__ !== "chrome") {
  browser.webRequest.onBeforeRequest.addListener(
    receiveProfileOrPlayback,
    {urls: ["*://www.crunchyroll.com/*"]},
    ["blocking"]
  );
}
browser.runtime.onMessage.addListener(receiveContentMsg);
browser.webRequest.onSendHeaders.addListener(
  receiveAuthHeaders,
  {urls: ["*://www.crunchyroll.com/*"]},
  getRequestHeaderSpec()
);
browser.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  if (details.url.includes("?dual_sub=676767")) return;
  setNextRequestTime(performance.now() + 5000);
}, {urls: ["*://www.crunchyroll.com/*"]})
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, _) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  if (!url.includes("crunchyroll.com/watch/")) return;
  console.log(`[dual-sub] new tab url for tab ${tabId} is ${shortenUrl(url)}`);
  await browser.tabs.sendMessage(tabId, {type: "CLEAR_CUES"});
  console.log(`[dual-sub] cleared cues on tab ${tabId}`);
  if (__BROWSER_TYPE__ === "chrome") {
    notifyCueRefresh(tabId, await resolveCues(tabId, url, null));
  } else {
    shouldRefresh = true;
  }
}); // no filter because chrome compat
browser.runtime.onUpdateAvailable.addListener(receiveUpdateNotif);

/**
 * @param tabId id of the tab requesting cue resolution
 * @param url url of the tab requesting cue resolution
 * @param audio audio locale of the tab requesting cue resolution
 * @param refresh refreshes the cache
 */
async function resolveCues(tabId: number, url: string, audio: string | null, refresh = false) {
  let altCues = refresh ? null : getAltCues(tabId, url, audio);
  if (altCues === null || altCues === undefined) {
    console.log("[resolveCues] alt subs are undefined/wrong upon request, grabbing...");
    const headers = getOrLoadHeaders(tabId);
    if (!headers) {
      console.log("[resolveCues] headers not set");
      return Promise.reject("auth data not found.");
    }
    const preference = await resolvePreference(getProfile(tabId) ?? await grabAndHandleProfile(tabId));
    console.log("[resolveCues] preference is", preference);
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
        await handleManifestAndAudio(parsed, details.tabId);
        if (shouldRefresh) {
          shouldRefresh = false;
          console.log("[receiveProfileOrPlayback] refresh triggered.");
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
  switch (msg?.type) {
    case "GET_CUES":
      return await resolveCues(tabId, url, getAudio(tabId) ?? null, msg.refresh);
    case "GET_CHOICES":
      let manifest = getEpisodeManifest(tabId);
      if (!manifest) {
        console.log("[receiveContentMsg] GET_CHOICES: manifest not found, loading...");
        manifest = await grabAndHandleManifest(tabId);
      }
      return manifest;
    case "GET_PREFERENCE":
      return await resolvePreference(getProfile(tabId) ?? await grabAndHandleProfile(tabId));
    case "SET_PREFERENCE":
      if (msg.scope !== "global" && !getEpisodeManifest(tabId)) {
        console.log("[receiveContentMsg] SET_PREFERENCE: manifest not found, loading...");
        await grabAndHandleManifest(tabId);
      }
      const set = await setPreference(msg.scope ?? "season",
        getProfile(tabId) ?? await grabAndHandleProfile(tabId),
        msg.pref!,
        findSeasonGuid(tabId),
        findGuid(tabId)
      );
      console.log("[receiveContentMsg] SET_PREFERENCE: done", msg, set);
      break;
    case "REFRESH_TAB":
      return browser.tabs.reload(tabId);
  }
}

async function receiveAuthHeaders(details: WebRequest.OnSendHeadersDetailsType) {
  if (details.tabId < 0) return;
  if (details.requestHeaders === undefined) return;
  if (setHeaders(details.tabId, details.requestHeaders))
    console.debug(`[receiveAuthHeaders] headers set for tab ${details.tabId} based off of ${shortenUrl(details.url)}`);
}

function receiveUpdateNotif(details: Runtime.OnUpdateAvailableDetailsType) {
  browser.tabs.query({url: "*://*.crunchyroll.com/*"}).then(tabs => {
    console.groupCollapsed(`[receiveUpdateNotif] received update ${details.version}`);
    for (const tab of tabs) {
      if (tab.id == null) continue;

      browser.tabs.sendMessage(tab.id, {
        type: "UPDATE_AVAILABLE",
        version: details.version
      })
        .then(() => console.log(`${tab.id}: sent`))
        .catch(e => console.warn(`${tab.id}: failed`, e));
    }
    console.groupEnd();
  });
}

export function shortenUrl(urlStr: string) {
  try {
    const parts = new URL(urlStr).pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[parts.length - 1]}` : "/";
  } catch {
    return urlStr;
  }
}

function getRequestHeaderSpec(): WebRequest.OnSendHeadersOptions[] {
  const spec: WebRequest.OnSendHeadersOptions[] = ["requestHeaders"];

  if (__BROWSER_TYPE__ === "chrome") {
    spec.push("extraHeaders");
  }

  return spec;
}