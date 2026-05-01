import type {SubChoices} from "../subtitle/manager";
import type {Preference} from "../subtitle/loader";
import browser from "webextension-polyfill";
import {updateCues} from "../content";

let subtitleControl: HTMLDivElement | null = null;
let subtitleTrigger: HTMLDivElement | null = null;
let subtitleMenu: HTMLDivElement | null = null;
let subtitleLabelNode: Text | null = null;

export function ensureSubtitleControlShell() {
  const episodeActions = document.querySelector(".episode-actions");
  if (!episodeActions) return;

  subtitleControl =
    document.querySelector("#cr-dual-subs-sub-control") ??
    document.createElement("div");
  subtitleControl.id = "cr-dual-subs-sub-control";

  subtitleTrigger =
    subtitleControl.querySelector("#cr-dual-subs-sub-trigger") ??
    document.createElement("div");
  subtitleTrigger.id = "cr-dual-subs-sub-trigger";

  subtitleMenu =
    subtitleControl.querySelector("#cr-dual-subs-sub-menu") ??
    document.createElement("div");
  subtitleMenu.id = "cr-dual-subs-sub-menu";

  if (!subtitleTrigger.hasChildNodes()) {
    subtitleLabelNode = document.createTextNode("Second subtitles ");
    subtitleTrigger.appendChild(subtitleLabelNode);

    const arrow = document.createElement("span");
    arrow.textContent = "▾";
    subtitleTrigger.appendChild(arrow);
  } else {
    subtitleLabelNode = subtitleTrigger.firstChild as Text;
  }

  ensureSubtitleListeners();

  subtitleControl.append(subtitleTrigger, subtitleMenu);
  episodeActions.appendChild(subtitleControl);
}

function ensureSubtitleListeners() {
  if (!subtitleTrigger || !subtitleMenu || !subtitleControl) return;

  if (!subtitleTrigger.dataset.listenerAttached) {
    subtitleTrigger.addEventListener("click", () => {
      subtitleControl?.classList.toggle("open");
    });
    subtitleTrigger.dataset.listenerAttached = "true";
  }

  if (!subtitleMenu.dataset.listenerAttached) {
    subtitleMenu.addEventListener("click", async (e) => {
      const option = (e.target as HTMLElement).closest(".cr-dual-subs-sub-option") as HTMLElement | null;
      if (!option) return;
      await handleSubtitleOptionClick(option);
    });
    subtitleMenu.dataset.listenerAttached = "true";
  }
}

export function updateSubtitleDropdownOptions(subOptions: SubChoices, pref: Preference) {
  if (!subtitleControl || !subtitleMenu || !subtitleLabelNode) ensureSubtitleControlShell();
  if (!subtitleMenu || !subtitleLabelNode) return;

  subtitleMenu.innerHTML = "";

  let hasSelected = false;

  // normal subs
  for (const [key, sub] of Object.entries(subOptions.subs)) {
    const option = document.createElement("div");
    option.className = "cr-dual-subs-sub-option";
    option.textContent = sub.language;
    option.dataset.key = key;
    option.dataset.type = "sub";

    if (!hasSelected && key === pref.subLanguage && !pref.doCc) {
      option.classList.add("active");
      subtitleLabelNode.textContent = `${sub.language} `;
      hasSelected = true;
    }

    subtitleMenu.appendChild(option);
  }

  // cc subs
  for (const [key, cc] of Object.entries(subOptions.ccs)) {
    const option = document.createElement("div");
    option.className = "cr-dual-subs-sub-option";
    option.textContent = `${cc.language} [CC]`;
    option.dataset.key = key;
    option.dataset.type = "cc";

    if (!hasSelected && key === pref.subLanguage && pref.doCc) {
      option.classList.add("active");
      subtitleLabelNode.textContent = `${cc.language} [CC] `;
      hasSelected = true;
    }

    subtitleMenu.appendChild(option);
  }

  // fallback if pref not found
  if (!hasSelected) {
    const first = subtitleMenu.querySelector(".cr-dual-subs-sub-option") as HTMLElement | null;
    if (first) {
      first.classList.add("active");
      subtitleLabelNode.textContent = `${first.textContent} `;
      console.log("[dual-sub] preference not available for this episode, overriding", first);
      first.click();
    }
  }
}

async function handleSubtitleOptionClick(option: HTMLElement) {
  subtitleMenu?.querySelectorAll(".cr-dual-subs-sub-option").forEach(el => {
    el.classList.remove("active");
  });

  option.classList.add("active");
  subtitleLabelNode!.textContent = `${option.textContent} `;
  subtitleControl?.classList.remove("open");

  const key = option.dataset.key;
  const isCc = option.dataset.type === "cc";

  const pref: Preference = {doCc: isCc, subLanguage: key! }
  await browser.runtime.sendMessage({type: "SET_PREFERENCE", pref})
  console.log("[dual-sub] new pref set", pref);
  await updateCues();
  console.log("[dual-sub] updated cues");
}