import {grabPreference} from "../content";
import browser from "webextension-polyfill";

export let overlayRoot: HTMLDivElement;
export let overlayText: HTMLDivElement;

export function ensureSubtitleOverlay(videoEl: HTMLVideoElement) {
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
  overlayText.innerText = "Secondary subtitles loading...";

  overlayRoot.appendChild(overlayText);
  container.appendChild(overlayRoot);

  grabPreference().then(pref => {
    if (pref.leftPct !== undefined && pref.bottomPct !== undefined) {
      setTextPos(pref.leftPct, pref.bottomPct);
    }
  })

  ensureDragListeners();
}

function setTextPos(left?: number, bottom?: number) {
  if (!overlayText) return;

  if (left == null || bottom == null) {
    overlayText.style.left = "50%";
    overlayText.style.bottom = "10%";
    overlayText.style.transform = "translateX(-50%)";
    overlayText.style.top = "auto";
    return;
  }

  overlayText.style.left = `${left}%`;
  overlayText.style.bottom = `${bottom}%`;
  overlayText.style.transform = "translateX(-50%)";
  overlayText.style.top = "auto";
}

async function savePref(xPct?: number, yPct?: number) {
  const pref = await grabPreference();
  if (!pref) {
    console.error("[dual-subs] couldn't grab preference when saving subtitle location");
    return;
  }
  pref.leftPct = xPct;
  pref.bottomPct = yPct;
  await browser.runtime.sendMessage({type: "SET_PREFERENCE", pref});
  console.log("[dual-subs] new pref set", pref);
}

function ensureDragListeners() {
  if (!overlayText || !overlayRoot) return;
  if (overlayText.dataset.listenerAttached) return;

  overlayText.draggable = true;
  overlayText.dataset.listenerAttached = "true";

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let leftPct: number | undefined;
  let bottomPct: number | undefined;

  overlayText.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    await savePref(undefined, undefined);
    setTextPos(undefined, undefined);
  });

  overlayText.addEventListener("pointerdown", e => {
    dragging = true;

    const textRect = overlayText!.getBoundingClientRect();

    offsetX = e.clientX - textRect.left;
    offsetY = e.clientY - textRect.top;

    overlayText!.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  overlayText.addEventListener("pointermove", e => {
    if (!dragging) return;

    const rootRect = overlayRoot!.getBoundingClientRect();
    const textRect = overlayText!.getBoundingClientRect();

    const renderedLeftPx = e.clientX - rootRect.left - offsetX;
    const centeredLeftPx = renderedLeftPx + textRect.width / 2;

    leftPct = (centeredLeftPx / rootRect.width) * 100;

    const topPx = e.clientY - rootRect.top - offsetY;
    const bottomPx = rootRect.height - topPx - textRect.height;

    bottomPct = (bottomPx / rootRect.height) * 100;

    setTextPos(leftPct, bottomPct);
  });

  overlayText.addEventListener("pointerup", async e => {
    dragging = false;
    overlayText!.releasePointerCapture(e.pointerId);
    await savePref(leftPct, bottomPct);
  });
}