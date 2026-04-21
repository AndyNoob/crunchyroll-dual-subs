import {getAltCues, grabPlayback, handlePlayback, handleProfile} from "./subtitle/handler";
import HttpHeaders = browser.webRequest.HttpHeaders;

console.log("[dual-sub] background loaded");

browser.webRequest.onBeforeRequest.addListener((details) => {
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
        else await handlePlayback(parsed, details.tabId);
        console.log(`[dual-sub] processed ${isProfile ? "profiles" : "playback"} data on tab ${details.tabId}`);
      } catch (err) {
        console.error("[dual-sub] processing failed:", err);
      }
    }
  },
  {
    urls: [
      "*://www.crunchyroll.com/*",
    ]
  },
  ["blocking"]
);

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const isValid = sender.tab && sender.tab.id && sender.tab.id >= 0;
  if (!isValid) return Promise.reject();
  if (msg?.type === "GET_CUES") {
    let altCues = getAltCues(sender.tab!.id!);
    if (!altCues || altCues.length === 0) {
      console.log("[dual-sub] playback is undefined upon request, grabbing...");
      const headers = getHeaders(sender.tab!.id);
      if (!headers) {
        console.log("[dual-sub] headers not set");
        return Promise.reject("auth data not found.");
      }
      altCues = await grabPlayback(sender.tab!.id!);
      console.log(`[dual-sub] grabbed ${altCues?.length} cues upon request`);
    }
    return Promise.resolve(altCues);
  }
  if (msg?.type === "GET_URL") {
    return sender.tab!.url;
  }
  if (msg?.type === "REFRESH_TAB") {
    return browser.tabs.reload(sender.tab!.id!);
  }
});

export const getHeaders: (number) => HttpHeaders | undefined = (tabId) => {
  return headersMap.get(tabId);
};
const headersMap = new Map<number, HttpHeaders>();

browser.webRequest.onSendHeaders.addListener((details) => {
  if (details.tabId < 0) return;
  if (details.requestHeaders === undefined) return;
  headersMap.set(details.tabId, details.requestHeaders);
  console.log(`[dual-sub] headers set for tab ${details.tabId} based off of ${details.url}`);
}, {
  urls: [
    "*://www.crunchyroll.com/*"
  ]
}, ["requestHeaders"]);