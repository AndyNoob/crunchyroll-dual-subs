import {grabPreference, log, preference} from "../content";
import {
  createMoveMe,
  type Moving,
  type RectState
} from "@andynoob/move-it";
import {DEFAULT_SECONDARY_STATE} from "../shared";
import browser from "webextension-polyfill";

export let overlayRoot: HTMLDivElement;
export let overlayTextContainer: HTMLDivElement;
export let overlayText: HTMLDivElement;
export let overlayTextMoving: Moving;
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

  overlayTextContainer = document.querySelector("#cr-dual-subs-secondary-container") ?? document.createElement("div");
  overlayTextContainer.id = "cr-dual-subs-secondary-container";

  if (!overlayTextContainer.hasChildNodes()) {
    overlayTextContainer.appendChild(overlayText);
  }

  overlayCanvasContainer = document.querySelector("#cr-dual-subs-canvas-container") ?? document.createElement("div");
  overlayCanvasContainer.id = "cr-dual-subs-canvas-container";

  overlayRoot.append(overlayTextContainer, overlayCanvasContainer);
  container.appendChild(overlayRoot);

  grabPreference().then(pref => {
    if (pref == null) {
      console.error("[dual sub overlay] could not load preference");
      return;
    }
    let lastPos: RectState | null = pref.subtitlePos || null;
    if (lastPos) {
      lastPos.width = 100;
      lastPos.height = 100;
    }
    log("updating subtitle from pref", lastPos);
    log(`container size is ${overlayTextContainer.offsetWidth} x ${overlayTextContainer.offsetHeight}`);
    overlayTextMoving = createMoveMe(overlayText, {
      controlRoot: overlayTextContainer,
      initialState: {...(pref.subtitlePos || DEFAULT_SECONDARY_STATE)},
      format: {
        centered: true,
        asPercent: true
      },
      autoSize: true,
      disableFeatures: {
        rotate: true,
        resize: true
      },
      snapping: {
        grid: {
          threshold: 4,
          displayThreshold: 8,
          verticalX: [0.5],
          horizontalY: [0.95],
          asPercent: true
        }
      },
      pivotOffset: {
        x: 0,
        y: 0.5
      },
      onChange: () => {
        const pos = overlayTextMoving.getState();
        console.log(lastPos, pos);
        if (preference) preference.subtitlePos = pos;
        if (lastPos
          && lastPos.x === pos.x
          && lastPos.y === pos.y) {
          lastPos = pos;
          return;
        }
        grabPreference().then(pref => {
          pref.subtitlePos = pos;
          browser.runtime.sendMessage({type: "SET_PREFERENCE", pref})
            .then(() => console.log("[dual sub editor] new subtitle pos set", pref, pos))
            .catch((e) => console.error("[dual sub editor] failed to set subtitle pos", pref, pos, e));
        });
        lastPos = pos;
      }
    });
    overlayTextMoving.render();
    overlayText.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      overlayTextMoving.updateState({...DEFAULT_SECONDARY_STATE});
    }, {capture: true});
    // overlayText.addEventListener("pointerdown", (e) => {
    //   e.stopPropagation();
    //   e.preventDefault();
    // }, {capture: true});
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
}
