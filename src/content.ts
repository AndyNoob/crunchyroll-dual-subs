import browser from "webextension-polyfill";
import {ensureSubtitleOverlay} from "./ui/overlay";
import {
  ensureSubtitleControlShell,
  setTooltipText,
  showStreamLimitNotice,
  updateNotice,
  updateSubtitleDropdownOptions
} from "./ui/controls";
import type {Preference} from "./data/preferences";
import type {SubtitleManifest} from "./data/subtitles";
import {grabVideo, shouldSkip, videoEl, beginRender, shutdownRender, updateOffsets} from "./ui/rendering";

export type Format = "vtt" | "ass" | "none";
export interface Tracks {
  [lang: string]: Track
}
export interface Track {
  content: string,
  format: Format,
  lang: string
}
let tracks: Tracks | null = null;
let lastInit: string | null = null;
export let preference: Preference | null = null;

addListeners();

init().then().catch(r => {
  console.error(`[dual-sub] failed to init extension on ${location.href}`);
  console.error(r);
});

export async function updateCuesAndRender(refresh = false) {
  if (refresh) {
    tracks = (await browser.runtime.sendMessage({type: "GET_CUES", refresh})
      .catch(r => console.warn(r))) as Tracks;
  } else tracks = await grabCues();
  await shutdownRender();
  await beginRender(tracks);
}

async function grabCues() {
  return (await browser.runtime.sendMessage({type: "GET_CUES"}).catch(r => console.warn(r))) as Tracks;
}

async function grabSubManifest() {
  return (await browser.runtime.sendMessage({type: "GET_CHOICES"}).catch(r => console.warn(r))) as SubtitleManifest;
}

export async function grabPreference(): Promise<Preference> {
  return preference ?? (await browser.runtime.sendMessage({type: "GET_PREFERENCE"})) as Preference
}

export async function updateDropdownOptions() {
  log("updating sub choices...");
  const manifest = await grabSubManifest();
  preference = null;
  preference = await grabPreference();
  log("pref is", preference);
  log("manifest is", manifest);
  updateSubtitleDropdownOptions(manifest, preference);
  log("updated sub choices");
}

async function init() {
  if (lastInit === location.href) {
    log("skipping double init");
    await updateDropdownOptions();
    return false;
  }
  log(`init begin on ${location.href}`);
  lastInit = location.href;
  if (await shouldSkip()) {
    log("not a watch page (probably)");
    return Promise.reject("[dual-sub] skipping, not a watch page (probably)");
  }
  log("not skipping, injecting...");
  await ensurePageInjections();
  log("done, grabbing cues in 1.5s...");
  await sleep(1500);
  await updateCuesAndRender();
  if (tracks == null) {
    console.warn("failed to grab cues!");
    if (confirm("[Crunchyroll Dual Sub] Could not retrieve subtitle data. Please try refreshing or use the refresh button after a few moments.")) {
      await browser.runtime.sendMessage({type: "REFRESH_TAB"});
    }
    return Promise.reject("failed to grab cues");
  }

  log("updating subtitle dropdown...");
  await updateDropdownOptions();
  log("init complete!");
  return true;
}

async function ensurePageInjections() {
  await grabVideo();
  ensureSubtitleOverlay(videoEl);
  log("injected overlay");
  ensureSubtitleControlShell();
  log("injected subtitle control");
}

function addListeners() {
  browser.runtime.onMessage.addListener(async (msg: any) => {
    switch (msg?.type) {
      case "REFRESH_CUES":
        tracks = msg.cues;
        log(`refreshed cues`);
        init().then(async (r) => {
          if (!r) {
            log(`manual init`);
            await updateDropdownOptions();
            await shutdownRender();
            await beginRender(msg.cues as Tracks);
          }
        }).catch(async (r) => {
          console.error(`[dual-sub] failed to (re)init extension on ${location.href}`);
          console.error(r);
        });
        return true;
      case "TRY_HACK":
        await tryHackToRefreshToken();
        return true;
      case "TAB_ID":
        return sessionStorage.getItem("cx-tab-id");
      case "FETCH_SUBTITLE":
        log("fetching subtitle in content script");
        const response = await fetch(msg.url);
        if (!response || !response.ok) return "";
        return await response.text();
      case "UPDATE_AVAILABLE":
        if (updateNotice) {
          updateNotice.classList.add("visible");
          setTooltipText(updateNotice, `Update available: ${browser.runtime.getManifest().version} → ${msg.version}`);
        }
        break;
      case "CLEAR_CUES":
        tracks = null;
        await shutdownRender();
        log("received clear cues message from background.");
        break;
      case "UPDATE_PREFERENCE": {
        log("updating preferences from popup");
        await updateDropdownOptions();
        await updateCuesAndRender();
        await updateOffsets(preference!);
        break;
      }
      case "PLAYBACK_BLOCKED": {
        showStreamLimitNotice(msg.blockedUntil);
      }
    }
  });
  log("added msg listener");
  window.addEventListener(
    "cr-dual-subs-monkey-patching",
    async (e) => {
      const detail = (e as CustomEvent).detail;
      log("received communications", detail);
      await browser.runtime.sendMessage({type: "MONKEY_PATCH_UPDATE", detail});
    }
  );
  log("established connections with monkey patching host");
  window.navigation.addEventListener("currententrychange", (event) => {
    const currentUrl = event.from.url;
    const newUrl = window.navigation.currentEntry?.url;
    log("url changed");
    if (currentUrl != newUrl) lastInit = null;
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function tryHackToRefreshToken() {
  // this seems to trigger a play head request that contains auth headers, in case
  // the background script is asleep at this point
  const wasPaused = videoEl.paused;
  if (wasPaused) {
    await videoEl.play();
  } else {
    videoEl.pause();
  }
  await sleep(10);
  if (wasPaused) {
    videoEl.pause();
  } else {
    await videoEl.play();
  }
  await sleep(5000);
}

export function log(...data: any[]) {
  console.log("[dual-sub]", `${getCallerName()}:`, ...data);
}

function getCallerName() {
  // generated by Google Search AI
  const obj = {};
  // The second argument (getCallerName) tells V8 to hide this
  // function and everything above it from the trace.
  // @ts-ignore
  Error.captureStackTrace(obj, getCallerName);

  // The first line is 'Error', the second line is the actual caller.
  const stackLines = (obj as any).stack.split('\n');
  const callerLine = stackLines[2];

  // Extract function name using regex
  const match = /at (\S+)/.exec(callerLine);
  return match ? match[1] : 'anonymous';
}
