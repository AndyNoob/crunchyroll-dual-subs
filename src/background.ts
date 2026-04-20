import {altCues, handlePlayback, handleProfile} from "./subtitle/handler";

console.log("[dual-sub] background loaded");

browser.webRequest.onBeforeRequest.addListener((details) => {
    if (details.tabId < 0) return;
    const isProfile = details.url.includes("/me/multiprofile");
    if (details.url.includes(".com/playback/v3") || isProfile) {
      console.log(`[dual-sub] received ${isProfile ? "profile" : "playback"} request with id ${details.requestId}`)
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

        try {
          if (isProfile) handleProfile(parsed);
          else await handlePlayback(parsed, details.tabId);
          console.log(`[dual-sub] processed ${isProfile ? "profiles" : "playback"} data on tab ${details.tabId}`);
        } catch (err) {
          console.error("[dual-sub] processing failed:", err);
        } finally {
          filter.disconnect();
        }
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

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "GET_CUES") {
    return Promise.resolve(altCues);
  }
});