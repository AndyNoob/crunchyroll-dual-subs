let videoEl: HTMLVideoElement;
let overlayRoot: HTMLDivElement;
let overlayText: HTMLDivElement;

let lastRendered = "";

let altCues: Cue[];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function init() {
  let url;
  try {
    url = await browser.runtime.sendMessage({type: "GET_URL"});
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
  videoEl = document.querySelector("video");
  let counter = 3;
  while (!videoEl && counter-- > 0) {
    await sleep(1000);
    videoEl = document.querySelector("video");
  }
  if (!videoEl) {
    console.warn(`[dual-sub] skipping ${location.href} because video player is not found`);
    return Promise.reject("failed and skipping init, could not find video player");
  }

  console.log(`[dual-sub] init on frame ${browser.runtime.getFrameId(window)}`)

  ensureOverlay();

  console.log("[dual-sub] grabbing cues...");
  try {
    altCues = (await browser.runtime.sendMessage({type: "GET_CUES"}));
  } catch {
    if (confirm("[Crunchyroll Dual Sub] Please reload watch page, could not retrieve subtitle data.")) {
      await browser.runtime.sendMessage({type: "REFRESH_TAB"});
    }
    return Promise.reject("failed to grab cues");
  }
  console.log(`[dual-sub] grabbed ${altCues.length} cues.`);
  console.log("[dual-sub] starting renderloop...");
  requestAnimationFrame(renderLoop);
  console.log("[dual-sub] subtitle animation started");

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "REFRESH_CUES") return;
    altCues = msg.cues;
    console.log(`[dual-sub] refreshed cues (${altCues.length} loaded)`);
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

  overlayRoot = document.createElement("div");
  overlayRoot.id = "cr-dual-subs-root";

  overlayText = document.createElement("div");
  overlayText.id = "cr-dual-subs-secondary";

  overlayRoot.appendChild(overlayText);
  container.appendChild(overlayRoot);
}

let lastTime = 0;

function renderLoop() {
  if (!videoEl || !overlayText) {
    console.error("[dual-sub] overlay or video doesn't exist while rendering");
    // requestAnimationFrame(renderLoop);
    return;
  }

  const time = videoEl.currentTime;

  const secondaryCue = getActiveCue(altCues, time);
  const nextText = secondaryCue?.text || "";

  if (nextText !== lastRendered) {
    overlayText.textContent = nextText;
    overlayText.style.display = nextText.length > 0 ? "block" : "none";
    lastRendered = nextText;
  }

  lastTime = time;

  requestAnimationFrame(renderLoop);
}

function getActiveCue(cues: Cue[], time): Cue | null {
  // TODO use binary search
  for (const cue of cues) {
    if (time >= cue.start && time <= cue.end) return cue;
  }
  return null;
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
