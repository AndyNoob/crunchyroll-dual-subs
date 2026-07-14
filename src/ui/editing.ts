import type {SubMask} from "../data/preferences";
import {overlayCanvasContainer} from "./overlay";
import {convertToPercent, convertToPixels, createMoveMe, type Moving} from "@andynoob/move-it";

const movingList: Moving[] = [];

export function clearMoving() {
  const removing = overlayCanvasContainer.querySelectorAll("[data-move-it-id]");
  for (const moving of movingList) {
    moving.destroy();
  }
  for (const element of removing) {
    element.remove();
  }
}

export function makeMoving(subMask: SubMask, callback: (newMask: SubMask) => void) {
  for (let i = 0; i < subMask.rects.length; i++){
    let rect = subMask.rects[i]!;
    const element = overlayCanvasContainer.appendChild(document.createElement("div"));
    movingList.push(createMoveMe(
      element,
      {
        initialState: convertToPixels(overlayCanvasContainer, rect),
        controlRoot: overlayCanvasContainer,
        onChange: (state) => {
          subMask.rects[i] = {...rect, ...convertToPercent(overlayCanvasContainer, state)};
          callback(subMask);
        },
        doResize: true,
        disableFeatures: {
          rotate: true
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