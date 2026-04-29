import browser from "webextension-polyfill";

let videoEl: HTMLVideoElement;
let overlayRoot: HTMLDivElement;
let overlayText: HTMLDivElement;

let lastRendered = "";
let currentCues: Cue[];

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
  await sleep(3000);
}

async function grabCues() {
  return (await browser.runtime.sendMessage({type: "GET_CUES"}).catch(r => console.warn(r))) as Cue[];
}

async function init() {
  let url: string;
  try {
    url = await browser.runtime.sendMessage({type: "GET_URL"}) as string;
  } catch (e) {
    console.error(e);
    return Promise.reject("could not get url of top");
  }
  if (!url) return Promise.reject("could not get url of top");
  if (location.href !== url) console.log(`[dual-sub] loading ${location.href} inside ${url}`);
  if (!url.includes("/watch/")) {
    console.log(`[dual-sub] skipping ${location.href} because the top url is not a watch page`);
    return Promise.resolve("not a watch page");
  }
  console.log(`[dual-sub] not skipping ${location.href}`);
  let vid = document.querySelector("video");
  let counter = 4;
  while (!vid && counter-- > 0) {
    await sleep(1000);
    vid = document.querySelector("video");
  }
  if (!vid) {
    console.warn(`[dual-sub] skipping ${location.href} because video player is not found`);
    return Promise.reject("failed and skipping init, could not find video player");
  }

  videoEl = vid as HTMLVideoElement;

  console.log(`[dual-sub] init on frame ${browser.runtime.getFrameId(window)}`)

  ensureOverlay();

  console.log("[dual-sub] grabbing cues...");

  currentCues = await grabCues();

  if (!currentCues || !currentCues.length) {
    // at this point, the background.ts was probably put to
    // sleep by the browser. however, since we sent a msg over
    // it is now awake but missing the authorization headers and such
    // to grab the playback. by running this hack, we force crunchy
    // to send a request that contains the headers we need.
    await tryHackToRefreshToken();
    currentCues = await grabCues();

    if (!currentCues || !currentCues.length) {
      console.warn("[dual-subs] failed to grab cues");
      if (confirm("[Crunchyroll Dual Sub] Please reload watch page, could not retrieve subtitle data.")) {
        await browser.runtime.sendMessage({type: "REFRESH_TAB"});
      }
      return Promise.reject("failed to grab cues");
    }
  }

  console.log(currentCues);

  console.log(`[dual-sub] grabbed ${currentCues.length} cues.`);
  console.log("[dual-sub] starting renderloop...");
  requestAnimationFrame(renderLoop);
  console.log("[dual-sub] subtitle animation started");

  browser.runtime.onMessage.addListener(async (msg: any) => {
    if (msg?.type === "REFRESH_CUES") {
      currentCues = msg.cues;
      console.log(`[dual-sub] refreshed cues (${currentCues.length} loaded)`);
      return true;
    }
    if (msg?.type === "TRY_HACK") {
      await tryHackToRefreshToken();
      return true;
    }
  });
  console.log("[dual-sub] added tab update listener");

  console.log("[dual-sub] successfully init.");
  return Promise.resolve()
}

function ensureOverlay() {
  console.log("[dual-sub] ensuring overlay")
  if (overlayRoot) return;

  const video = videoEl;
  const container = video?.parentElement;
  if (!video || !container) return;

  const computed = getComputedStyle(container);
  if (computed.position === "static") {
    container.style.position = "relative";
  }

  overlayRoot = document.querySelector("#cr-dual-subs-root") ?? document.createElement("div");
  overlayRoot.id = "cr-dual-subs-root";

  overlayText = document.querySelector("#cr-dual-subs-secondary") ?? document.createElement("div");
  overlayText.id = "cr-dual-subs-secondary";

  overlayRoot.appendChild(overlayText);
  container.appendChild(overlayRoot);
}

function renderLoop() {
  if (!videoEl || !overlayText) {
    console.error("[dual-sub] overlay or video doesn't exist while rendering");
    // requestAnimationFrame(renderLoop);
    return;
  }

  const time = videoEl.currentTime;

  const secondaryCue = getActiveCue(currentCues, time);
  const nextText = secondaryCue?.text || "";

  if (nextText !== lastRendered) {
    overlayText.textContent = nextText;
    overlayText.style.display = nextText.length > 0 ? "block" : "none";
    lastRendered = nextText;
  }

  requestAnimationFrame(renderLoop);
}

function compare(cue: Cue, time: number): 0 | -1 | 1 {
  if (cue.start > time || cue.end < time)
    return cue.start > time ? 1 : -1;
  else return 0;
}

function getActiveCue(cues: Cue[], time: number): Cue | null {
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

init().then().catch(r => {
  console.error(`[dual-sub] failed to init extension on ${location.href}`);
  console.error(r);
});

export interface Cue {
  id: number,
  start: number,
  end: number,
  text: string
}
