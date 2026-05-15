import {grabPreference} from "../content";
import browser from "webextension-polyfill";

export let overlayRoot: HTMLDivElement;
export let overlayText: HTMLDivElement;
export let overlayCanvasContainer: HTMLDivElement;

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

  overlayCanvasContainer = document.querySelector("#cr-dual-subs-canvas-container") ?? document.createElement("div");
  overlayCanvasContainer.id = "cr-dual-subs-canvas-container";

  overlayRoot.append(overlayText, overlayCanvasContainer);
  container.appendChild(overlayRoot);

  grabPreference().then(pref => {
    if (pref == null) {
      console.error("[dual-sub] could not load preference");
      return;
    }
    if (pref.leftPct != null && pref.bottomPct != null) {
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
  pref.leftPct = xPct ?? 50;
  pref.bottomPct = yPct ?? 10;
  await browser.runtime.sendMessage({type: "SET_PREFERENCE", pref});
  console.log("[dual-subs] new pref set", pref);
}

export let dragging = false;

function ensureDragListeners() {
  if (!overlayText || !overlayRoot) return;
  if (overlayText.dataset.listenerAttached) return;

  overlayText.draggable = true;
  overlayText.dataset.listenerAttached = "true";

  let offsetX = 0;
  let offsetY = 0;
  let leftPct: number | undefined;
  let bottomPct: number | undefined;

  overlayText.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    leftPct = 50;
    bottomPct = 10;
    await savePref(undefined, undefined);
    setTextPos(undefined, undefined);
  });

  overlayText.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
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

type LogType = 'info' | 'warn' | 'error';

export class VideoLogger {
  private video: HTMLVideoElement;
  private container!: HTMLDivElement;
  private activeLog: HTMLDivElement | null = null;
  private timeoutId: number | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
    this._initContainer();
  }

  private _initContainer(): void {
    const wrapper = this.video.parentElement;
    if (!wrapper) {
      throw new Error('VideoLogger requires the video element to have a parent container.');
    }

    if (window.getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }

    this.container = document.createElement('div');
    this.container.id = 'video-log-overlay';

    Object.assign(this.container.style, {
      position: 'absolute',
      top: '10px',
      left: '10px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      fontSize: '12px',
      maxWidth: '300px'
    });

    wrapper.appendChild(this.container);
  }

  public log(message: string, type: LogType = 'info'): void {
    // Clear any active auto-dismiss timers to prevent overlapping cleanups
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Immediately fade out the old log item if it exists
    if (this.activeLog) {
      const oldLog = this.activeLog;
      oldLog.style.opacity = '0';
      oldLog.remove();
    }

    const logItem = document.createElement('div');

    let bgColor = 'rgba(0, 0, 0, 0.85)';
    if (type === 'error') bgColor = 'rgba(220, 53, 69, 0.9)';
    if (type === 'warn') bgColor = 'rgba(255, 193, 7, 0.95)';

    Object.assign(logItem.style, {
      background: bgColor,
      color: type === 'warn' ? '#000' : '#fff',
      padding: '6px 12px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      transform: 'translateY(0)', // Renders instantly inline with no pop/flash
      height: 'max-content',
      opacity: '1',
      "overflow-wrap": "break-word"
    });

    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.container.appendChild(logItem);
    this.activeLog = logItem;
  }
}
