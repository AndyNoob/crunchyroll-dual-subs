import type {SubMask} from "../data/preferences";
import {overlayRoot, overlayText} from "./overlay";
import {
  convertToPercent,
  convertToPixels,
  createMoveMe,
  type Moving,
} from "@andynoob/move-it";
import {log} from "../content";

const movingList: Moving[] = [];

export let editingMasks = false;

export function clearMoving() {
  editingMasks = false;
  log("clearing masks!");
  const removing = [...overlayRoot.querySelectorAll("[data-move-it-id]")]
    .filter(e => e.id !== overlayText.id);
  for (const moving of movingList) {
    moving.destroy();
  }
  movingList.splice(0, movingList.length);
  for (const element of removing) {
    element.remove();
  }
  overlayText.classList.remove("editing");
}

export function makeMoving(subMask: SubMask, callback: (newMask: SubMask) => void) {
  editingMasks = true;
  log("editing masks!");
  overlayText.classList.add("editing");
  for (let i = 0; i < subMask.rects.length; i++){
    let rect = subMask.rects[i]!;
    const element = overlayRoot.appendChild(document.createElement("div"));
    movingList.push(createMoveMe(
      element,
      {
        initialState: convertToPixels(overlayRoot, rect),
        controlRoot: overlayRoot,
        onChange: (state) => {
          subMask.rects[i] = {...rect, ...convertToPercent(overlayRoot, state)};
          callback(subMask);
        },
        doResize: true,
        disableFeatures: {
          rotate: true
        },
        snapping: {
          grid: {
            threshold: 4,
            displayThreshold: 8,
            verticalX: [0.5]
          }
        }
      }
    ));
    element.style.backgroundColor = subMask.inverted ? "green" : "red";
    element.style.opacity = "0.75";
    element.style.border = "3px solid black";
    element.style.outline = "3px solid white";
    element.style.zIndex = "9999999999";
    element.style.pointerEvents = "all";
    element.style.position = "absolute";
  }
}