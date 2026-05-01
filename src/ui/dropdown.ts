import type {SubChoices} from "../subtitle/manager";
import type {Preference} from "../subtitle/loader";
import browser from "webextension-polyfill";
import {updateCues} from "../content";

// I love when GPT-5.2 does 90% of the work :muscles:

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

  const all = [
    ...Object.entries(subOptions.subs).map(([key, v]) => ({
      key,
      language: v.language,
      format: v.format,
      url: v.url,
      type: "sub" as const
    })),
    ...Object.entries(subOptions.ccs).map(([key, v]) => ({
      key,
      language: v.language,
      format: v.format,
      url: v.url,
      type: "cc" as const
    }))
  ].sort((a, b) => {
    const lang = a.language.localeCompare(b.language);
    if (lang !== 0) return lang;
    return a.type === "sub" ? -1 : 1; // sub before cc
  });

  for (const sub of all) {
    const option = document.createElement("div");
    option.className = "cr-dual-subs-sub-option";
    option.textContent = sub.type === "cc" ? `${sub.language} [CC]` : sub.language;
    option.dataset.key = sub.key;
    option.dataset.type = sub.type;

    if (!hasSelected && sub.key === pref.subLanguage && pref.doCc === (sub.type === "cc")) {
      option.classList.add("active");
      subtitleLabelNode.textContent = `${option.textContent} `;
      hasSelected = true;
    }

    subtitleMenu.appendChild(option);
  }

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