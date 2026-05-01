export function ensureSubtitleOverlay(videoEl: HTMLVideoElement) {
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

export let overlayRoot: HTMLDivElement;
export let overlayText: HTMLDivElement;