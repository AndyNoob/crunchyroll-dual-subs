import type {Cue} from "../content";
import browser from "webextension-polyfill";

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