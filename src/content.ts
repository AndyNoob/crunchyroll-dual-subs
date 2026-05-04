import browser from "webextension-polyfill";
import {ensureSubtitleOverlay, overlayText} from "./ui/overlay";
import {ensureSubtitleControlShell, updateSubtitleDropdownOptions} from "./ui/dropdown";
import type {SubChoices} from "./subtitle/manager";
import type {Preference} from "./subtitle/loader";

let videoEl: HTMLVideoElement;

let lastRendered = "";
let currentCues: Cue[];
let lastInit: string | null = null;

addMsgListener();

init().then().catch(r => {
  console.error(`[dual-sub] failed to init extension on ${location.href}`);
  console.error(r);
});

export async function updateCues() {
  currentCues = await grabCues();
}

async function grabCues() {
  return (await browser.runtime.sendMessage({type: "GET_CUES"}).catch(r => console.warn(r))) as Cue[];
}

async function grabChoices() {
  return (await browser.runtime.sendMessage({type: "GET_CHOICES"}).catch(r => console.warn(r))) as SubChoices;
}

async function grabPreference(): Promise<Preference> {
  return (await browser.runtime.sendMessage({type: "GET_PREFERENCE"})) as Preference
}

function addMsgListener() {
  browser.runtime.onMessage.addListener(async (msg: any) => {
    switch (msg?.type) {
      case "REFRESH_CUES":
        currentCues = msg.cues;
        console.log(`[dual-sub] refreshed cues (${currentCues.length} loaded)`);
        init().then().catch(r => {
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
        console.log("[dual-sub] fetching subtitle in content script");
        return await (await fetch(msg.url)).text();
    }
  });
  console.log("[dual-sub] added msg listener");
}

async function updateDropdownOptions() {
  console.log("[dual-sub] updating sub choices...");
  const subChoices = await grabChoices();
  const pref = await grabPreference();
  updateSubtitleDropdownOptions(subChoices, pref);
  console.log("[dual-sub] updated sub choices", subChoices, pref);
}

async function init() {
  if (lastInit === location.href) {
    console.log("[dual-sub] skipping double init");
    await updateDropdownOptions();
    return;
  }
  lastInit = location.href;
  if (await shouldSkip()) {
    return Promise.reject("[dual-sub] skipping, not a watch page (probably)");
  }
  console.log(`[dual-sub] not skipping ${location.href}`);
  let vid = getVideo();
  let counter = 4;
  while (!vid && counter-- > 0) {
    await sleep(1000);
    vid = getVideo();
  }
  if (!vid) {
    console.warn(`[dual-sub] skipping ${location.href} because video player is not found`);
    return Promise.reject(`failed and skipping init on ${location.href}, could not find video player`);
  }

  videoEl = vid as HTMLVideoElement;

  console.log(`[dual-sub] init begin`)

  ensurePageInjections();

  await sleep(3000);
  console.log("[dual-sub] grabbing cues...");
  await updateCues();

  if (currentCues === null || currentCues === undefined) {
    console.warn("[dual-subs] failed to grab cues");
    if (confirm("[Crunchyroll Dual Sub] Please reload watch page, could not retrieve subtitle data.")) {
      await browser.runtime.sendMessage({type: "REFRESH_TAB"});
    }
    return Promise.reject("failed to grab cues");
  }

  console.log(currentCues);
  console.log(`[dual-sub] grabbed ${currentCues.length} cues.`);

  await updateDropdownOptions();

  console.log("[dual-sub] starting subtitle render loop...");
  requestAnimationFrame(renderLoop);
  console.log("[dual-sub] subtitle render loop started");
  console.log("[dual-sub] successfully init.");
  return;
}

async function renderLoop() {
  if (await shouldSkip()) {
    console.log("[dual-sub] stopping render loop");
    return;
  }
  if (!videoEl || !overlayText) {
    console.error("[dual-sub] overlay or video doesn't exist while rendering");
    return;
  }

  const time = videoEl.currentTime;

  const secondaryCue = getActiveCue(currentCues, time);
  const nextText = secondaryCue?.text || "";

  if (!nextText || nextText !== lastRendered) {
    overlayText.textContent = nextText || "";
    overlayText.style.display = nextText && nextText.length > 0 ? "block" : "none";
    lastRendered = nextText;
  }

  // subtitleControl.innerText = "HI NICE TO MEET YOU"

  requestAnimationFrame(renderLoop);
}

async function shouldSkip() {
  let url: string = location.href;
  if (!url || !url.includes("/watch/")) {
    lastInit = null;
    console.log(`[dual-sub] skipping ${location.href} because the top url is not a watch page`);
    return true;
  }
  return false;
}

function getVideo() {
  return document.querySelector("video") || document.querySelector("iframe")?.contentDocument?.querySelector("video");
}

function ensurePageInjections() {
  ensureSubtitleOverlay(videoEl);
  console.log("[dual-sub] injected overlay");
  ensureSubtitleControlShell();
  console.log("[dual-sub] injected subtitle control");
}

function getActiveCue(cues: Cue[], time: number): Cue | null {
  if (cues.length === 0) return null;
  if (compare(cues[0]!, time) == 0)
    return cues[0] ?? null;
  if (compare(cues[cues.length - 1]!, time) == 0)
    return cues[cues.length - 1] ?? null;

  let index = cues.length / 2;
  let prev = 0;
  let cue: Cue | undefined;
  let comp: number;
  while ((cue = cues[Math.floor(index)]) && (comp = compare(cue, time)) != 0) {
    let diff = Math.abs((index - prev) / 2);
    const nextIndex = comp > 0 ? index - diff : index + diff;
    if (Math.floor(nextIndex) === Math.floor(index)) break;
    prev = index;
    index = nextIndex;
  }
  if (!cue || compare(cue, time) != 0) {
    return null;
  }
  return cue;
}

function compare(cue: Cue, time: number): 0 | -1 | 1 {
  if (cue.start > time || cue.end < time)
    return cue.start > time ? 1 : -1;
  else return 0;
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

export interface Cue {
  id: number,
  start: number,
  end: number,
  text: string
}
