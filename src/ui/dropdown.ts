import type {EpisodeManifest} from "../subtitle/manager";
import type {Preference} from "../subtitle/loader";
import browser from "webextension-polyfill";
import {updateCues} from "../content";

// I love when GPT-5.2 does 90% of the work :muscles:

let subtitleControl: HTMLDivElement | null = null;
let subtitleTrigger: HTMLDivElement | null = null;
let subtitleMenu: HTMLDivElement | null = null;
let subtitleLabelNode: Text | null = null;
let casing: HTMLDivElement | null = null;
let refreshButton: HTMLButtonElement | null = null;

// casing -> [refresh button, [[trigger -> label], menu]]

export function ensureSubtitleControlShell() {
  const episodeActions = document.querySelector(".episode-actions");
  if (!episodeActions) return;

  casing = document.querySelector("#cr-dual-subs-control-casing") ??
    document.createElement("div");
  casing.id = "cr-dual-subs-control-casing";

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

  refreshButton =
    casing.querySelector("#cr-dual-subs-refresh") ??
    document.createElement("button");
  refreshButton.id = "cr-dual-subs-refresh";

  if (!refreshButton.hasChildNodes())
    refreshButton.innerHTML = refreshSvg;

  if (!subtitleTrigger.hasChildNodes()) {
    subtitleLabelNode = document.createTextNode("Subtitles loading... ");
    subtitleTrigger.appendChild(subtitleLabelNode);

    const arrow = document.createElement("span");
    arrow.textContent = "▾";
    subtitleTrigger.appendChild(arrow);
  } else {
    subtitleLabelNode = subtitleTrigger.firstChild as Text;
  }

  ensureSubtitleListeners();

  subtitleControl.append(subtitleTrigger, subtitleMenu);
  casing.append(refreshButton, subtitleControl);
  episodeActions.appendChild(casing);
}

function ensureSubtitleListeners() {
  if (!subtitleTrigger || !subtitleMenu || !subtitleControl || !refreshButton) return;

  if (!refreshButton.dataset.listenerAttached) {
    refreshButton.addEventListener("click", async () => {
      if (!refreshButton) return;
      console.log("[dual-subs] refresh button clicked, refreshing...");
      if (!refreshButton) return;

      refreshButton.classList.remove("spinning");
      void refreshButton.offsetWidth; // force update class list
      refreshButton.classList.add("spinning");
      refreshButton.style.opacity = "0.4";

      try {
        await updateCues();
      } finally {
        setTimeout(() => {
          refreshButton!.style.opacity = "1";
          refreshButton!.classList.remove("spinning");
        }, 350);
      }
    });
    refreshButton.dataset.listenerAttached = "true";
  }

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

export function updateSubtitleDropdownOptions(manifest: EpisodeManifest, pref: Preference) {
  if (!subtitleControl || !subtitleMenu || !subtitleLabelNode) ensureSubtitleControlShell();
  if (!subtitleMenu || !subtitleLabelNode) return;

  subtitleMenu.innerHTML = "";

  let hasSelected = false;

  const all = [
    ...Object.entries(manifest.subs).map(([key, v]) => ({
      key,
      language: v.language,
      format: v.format,
      url: v.url,
      type: "sub" as const
    })),
    ...Object.entries(manifest.ccs).map(([key, v]) => ({
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

  const pref: Preference = {doCc: isCc, subLanguage: key!}
  await browser.runtime.sendMessage({type: "SET_PREFERENCE", pref})
  console.log("[dual-sub] new pref set", pref);
  await updateCues();
  console.log("[dual-sub] updated cues");
}

const refreshSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e3e3e3"><path d="M480-192q-120 0-204-84t-84-204q0-120 84-204t204-84q65 0 120.5 27t95.5 72v-99h72v240H528v-72h131q-29-44-76-70t-103-26q-90 0-153 63t-63 153q0 90 63 153t153 63q84 0 144-55.5T693-456h74q-9 112-91 188t-196 76Z"/></svg>`