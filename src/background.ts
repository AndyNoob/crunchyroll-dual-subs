import {getAltCues, grabPlayback, handlePlayback, handleProfile} from "./subtitle/handler";

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
    const altCues = getAltCues(sender.tab!.id!);
    if (!altCues || altCues.length === 0) {
      console.log("[dual-sub] playback is undefined, grabbing...");
      if (!getAuthorization(sender.tab!.id)) {
        return Promise.reject("auth data not found.");
      }
      await grabPlayback(sender.tab!.id!);
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

export const getAuthorization: (number) => string | undefined = (tabId) => {
  return authMap.get(tabId);
};
const authMap = new Map<number, string>();

browser.webRequest.onBeforeRequest.addListener((details) => {
    if (details.tabId < 0) return;
    console.log(`[dual-sub] received token request with id ${details.requestId}`);
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder("utf-8");

    let data = "";

    filter.ondata = (e) => {
      const decoded = decoder.decode(e.data);
      data += decoded;
      filter.write(e.data);
    }

    filter.onstop = () => {
      console.log(`[dual-sub] finishing token request id ${details.requestId}`);
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        console.warn(`[dual-sub] request id ${details.requestId} is extraneous`);
        console.log(data);
        filter.disconnect();
        return;
      }
      authMap.set(details.tabId, `${parsed["token_type"]} ${parsed["access_token"]}`);
      console.log(`[dual-sub] auth token set for tab ${details.tabId}`);
      filter.disconnect();
    }
  }, {
    urls: [
      "*://www.crunchyroll.com/auth/v1/token"
    ]
  },
  ["blocking"]
);