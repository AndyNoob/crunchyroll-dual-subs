import browser from "webextension-polyfill";
import {ensureSubtitleOverlay, overlayTextMoving} from "./ui/overlay";
import {
  ensureSubtitleControlShell,
  markAsLoading,
  setTooltipText,
  showStreamLimitNotice,
  updateNotice,
  updateSubtitleDropdownOptions
} from "./ui/controls";
import type {Preference} from "./data/preferences";
import type {SubtitleManifest} from "./data/subtitles";
import {
  beginRender,
  grabVideo,
  setFontProperty,
  shouldSkip,
  shutdownRender,
  updateEraser,
  updateOffsetsAndFont,
  videoEl
} from "./ui/rendering";
import {askMainWorld} from "./world-bridge";
import type {RawProfile} from "./data/profiles";
import {clearMoving, makeMoving} from "./ui/editing";

export type Format = "vtt" | "ass" | "none";

export interface Tracks {
  [lang: string]: Track
}

export interface Track {
  content: string,
  format: Format,
  lang: string
}

const w = window as any;

let tracks: Tracks | null = null;
let lastInit: string | null = null;
let rawProfiles: RawProfile[] = [];
let currentManifest: any | null = null;
let currentPlayback: any | null = null;
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

export async function grabPreference(refresh = true): Promise<Preference> {
  if (refresh || !preference) {
    return preference = (await browser.runtime.sendMessage({type: "GET_PREFERENCE"})) as Preference;
  } else {
    return preference;
  }
}

export async function updateDropdownOptions() {
  log("updating sub choices...");
  const manifest = await grabSubManifest();
  preference = null;
  preference = await grabPreference();
  log("pref is", preference);
  log("manifest is", manifest);
  await updateSubtitleDropdownOptions(manifest, preference);
  log("updated sub choices");
}

function getSlug(url: string) {
  return url.match(/crunchyroll\.com\/watch\/([^\/]+)/)?.[1];
}

async function init() {
  const slug = getSlug(location.href);
  if (!slug) {
    log("not a watch page (probably)");
    return Promise.reject("[dual-sub] skipping, not a watch page (probably)");
  }
  if (lastInit === slug) {
    log("skipping double init, however, dropdown options will be updated:");
    await updateDropdownOptions();
    return false;
  }
  log(`init begin on ${location.href}`);
  lastInit = slug;
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
  await ensureSubtitleControlShell();
  log("injected subtitle control");
}

function addListeners() {
  browser.runtime.onMessage.addListener((msg: any) => {
    switch (msg?.type) {
      case "REFRESH_CUES":
        if (msg.guid === getSlug(location.href)) {
          log("skipping refresh, guid is the same");
          return false;
        }
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
      case "TRY_HACK": // preceded SEND_TOKEN
        return tryHackToRefreshToken().then(() => true).catch(() => false);
      case "SEND_TOKEN": {
        return (async () => {
          const token = await askMainWorld<boolean>("GRAB_TOKEN").catch(() => null) as string | null;
          log(`sending token... (${token ? token.length : token})`);
          if (token) return token;
          else return null;
        })();
      }
      case "TAB_ID":
        return sessionStorage.getItem("cx-tab-id");
      case "FETCH_SUBTITLE":
        log("fetching subtitle in content script");
        return (async () => {
          const response = await fetch(msg.url);
          if (!response || !response.ok) return "";
          return await response.text();
        })();
      case "UPDATE_AVAILABLE":
        if (updateNotice) {
          updateNotice.classList.add("visible");
          setTooltipText(updateNotice, `Update available: ${browser.runtime.getManifest().version} → ${msg.version}`);
        }
        break;
      case "CLEAR_CUES":
        tracks = null;
        markAsLoading();
        return shutdownRender().then(() => {
          log("received clear cues message from background.");
        });
      case "UPDATE_PREFERENCE": {
        log("updating preferences from popup", preference);
        return (async () => {
          const old = preference ? {...preference} : null;
          preference = null;
          preference = await grabPreference();
          if (preference.subtitlePos)
            overlayTextMoving.updateState(preference.subtitlePos);
          setFontProperty(preference.fontProperty);
          if (old) log({
            doCC: old.doCc === preference.doCc,
            subLang: old.subLanguage === preference.subLanguage,
            primary: old.primaryOffsetMs === preference.primaryOffsetMs,
            secondary: old.secondaryOffsetMs === preference.secondaryOffsetMs,
          });
          if (old
            && old.doCc === preference.doCc
            && old.subLanguage === preference.subLanguage
            && old.primaryOffsetMs === preference.primaryOffsetMs
            && old.secondaryOffsetMs === preference.secondaryOffsetMs
          ) return;
          await updateDropdownOptions();
          await updateCuesAndRender();
          await updateOffsetsAndFont(preference!);
        })();
      }
      case "PLAYBACK_BLOCKED": {
        showStreamLimitNotice(msg.blockedUntil);
        break;
      }
      case "RAW_PROFILES": {
        return rawProfiles;
      }
      case "RAW_MANIFEST": {
        return currentManifest;
      }
      case "RAW_PLAYBACK": {
        return currentPlayback;
      }
      case "CLEAR_MOVING": {
        preference = null;
        return grabPreference().then(() => {
          updateEraser().then(() => {
            clearMoving();
            log("CLEAR_MOVING complete");
          })
        });
      }
      case "CREATE_MOVING": {
        clearMoving();
        updateEraser().then();
        return makeMoving(msg.subMask, (mask) => {
          browser.runtime.sendMessage({type: "UPDATE_MOVING", subMask: mask}).then(() => {
            if (preference) {
              preference.subMask = mask;
              updateEraser().then(() => log("eraser updated on mask move"));
            }
          });
        });
      }
    }
  });
  log("added msg listener");
  window.addEventListener(
    "cr-dual-subs-monkey-patching",
    async (e) => {
      const detail = (e as CustomEvent).detail;
      log("received communications", detail);
      if (detail.type === "profiles") {
        rawProfiles = detail.payload["profiles"];
        w.__dualSubsProfiles = rawProfiles;
      }
      if (detail.type === "manifest") {
        currentManifest = detail.payload;
        w.__dualSubsManifest = currentManifest;
      }
      if (detail.type === "playback") {
        currentPlayback = detail.payload;
        w.__dualSubsPlayback = currentPlayback;
      }
      await browser.runtime.sendMessage({type: "MONKEY_PATCH_UPDATE", detail});
    }
  );
  log("established connections with monkey patching host");
  window.navigation.addEventListener("currententrychange", (event) => {
    const currentUrl = event.from.url;
    const newUrl = window.navigation.currentEntry?.url;
    const curSlug = getSlug(currentUrl!);
    const newSlug = getSlug(newUrl!);
    if (!newSlug || curSlug !== newSlug) {
      log("url changed");
      lastInit = null;
      if (!curSlug) init().then();
    }
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
  log("hack complete.");
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
