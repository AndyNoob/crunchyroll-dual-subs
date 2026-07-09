import {grabPreference} from "../content";
import type {SubMask} from "../data/preferences";

export let editorMenu: HTMLElement | null = null;
export let invertButtonLabel: HTMLLabelElement | null = null;
export let invertButton: HTMLInputElement | null = null;
export let scopeLabel: HTMLLabelElement | null = null;
export let scopeSelect: HTMLSelectElement | null = null;
export let rectSpan: HTMLSpanElement | null = null;

export async function getEditorMenu(): Promise<HTMLElement> {
  editorMenu = document.querySelector("#cr-dual-sub-editor-menu")
    || document.createElement("div");
  editorMenu.id = "cr-dual-sub-editor-menu";

  scopeLabel = editorMenu.querySelector("#cr-dual-subs-scope-label")
    || editorMenu.appendChild(document.createElement("label"));
  scopeLabel.id = "cr-dual-subs-scope-label";
  scopeLabel.textContent = "Current scope";

  scopeSelect = editorMenu.querySelector("#cr-dual-subs-scope-select")
    || scopeLabel.appendChild(document.createElement("select"));
  scopeSelect.id = "cr-dual-subs-scope-select";
  scopeLabel.htmlFor = scopeSelect.id;

  scopeSelect.innerHTML = `<option value="global">Global</option><option value="season">Season</option><option value="episode">Episode</option>`;
  scopeSelect.value = "season";

  if (!editorMenu.classList.contains("cr-dual-subs-menu"))
    editorMenu.classList.add("cr-dual-subs-menu");

  invertButtonLabel = editorMenu.querySelector("#cr-dual-subs-invert-label")
    || editorMenu.appendChild(document.createElement("label"));
  invertButtonLabel.textContent = "Invert masks";
  invertButtonLabel.id = "cr-dual-subs-invert-label";

  invertButton = editorMenu.querySelector("input")
    || invertButtonLabel.appendChild(document.createElement("input"));
  invertButton.id = "cr-dual-subs-invert-button";
  invertButton.type = "checkbox";
  invertButtonLabel.htmlFor = invertButton.id;

  rectSpan = editorMenu.querySelector("span")
    || editorMenu.appendChild(document.createElement("span"));
  rectSpan.textContent = "Current masks";

  const preference = await grabPreference();
  const mask = preference.subMask;

  if (mask) handleMask(mask);

  return editorMenu;
}

function handleMask(mask: SubMask) {
  if (!invertButton) return;
  invertButton.checked = mask.inverted;

}

function ensureListeners() {
  if (!invertButton) return;
  if (!invertButton.dataset.listenerAdded) {
    invertButton.addEventListener("click", () => {

    });
    invertButton.dataset.listenerAdded = "true";
  }
}