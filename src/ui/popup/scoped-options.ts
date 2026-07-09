import browser from "webextension-polyfill";
import type {Preference, PreferencePatch, PreferenceScope} from "../../data/preferences";
import type {SubtitleManifest, Subtitles} from "../../data/subtitles";
import {type ContextResponse, getActiveCrunchyrollTabId, grabManifest, send} from "./common";

const lastScopeKey = "cr-dual-sub-last-scope";

// GPT-5.3/5.5 might be goated
// rah but it sucks at commenting what the hell is going on here

const profileDisplay = document.querySelector("#profile-select") as HTMLSelectElement;
const scopeSelect = document.querySelector("#scope-select") as HTMLFieldSetElement;
const subtitleSelect = document.querySelector("#subtitle-select") as HTMLSelectElement;
const primaryOffsetInput = document.querySelector("#primary-offset-input") as HTMLInputElement;
const secondaryOffsetInput = document.querySelector("#secondary-offset-input") as HTMLInputElement;
const resetPositionButton = document.querySelector("#reset-position-button") as HTMLButtonElement;

export const settingsContent = document.querySelector("#cr-dual-subs-overlay-options") as HTMLDivElement;

const scopeOptions: PreferenceScope[] = ["global", "season", "episode"];

/*function formatLocale(locale: string) {
  try {
    return new Intl.DisplayNames(
      ["en"],
      { type: "language" }
    ).of(locale) ?? locale;
  } catch {
    return locale;
  }
}*/

export let manifest: SubtitleManifest | null = null;
export let tabId: number;
export let context: ContextResponse;

function renderProfileSelect() {
  const profile = context.currentProfile;
  profileDisplay.textContent = `${profile.profileName}`;
}

async function renderScopeSelect() {
  console.log("[dual sub popup] scope select loading", context);
  const globalOption = scopeSelect.querySelector('input[value="global"]') as HTMLInputElement;
  const seasonOption = scopeSelect.querySelector('input[value="season"]') as HTMLInputElement;
  const episodeOption = scopeSelect.querySelector('input[value="episode"]') as HTMLInputElement;

  globalOption.checked = false;

  seasonOption.checked = false;
  seasonOption.disabled = !context.seasonGuid;
  seasonOption.textContent = context.seasonGuid ? "Current Season" : "Current Season (Unavailable)";

  episodeOption.checked = false;
  episodeOption.disabled = !context.episodeGuid;
  const episodeLabel = scopeSelect.querySelector(`label[for="scope-episode"]`)!;
  if (context.episodeGuid) {
    episodeLabel.innerHTML = `Current Episode<span class="hint">(${context.episodeGuid})</span>`;
  } else {
    episodeLabel.innerHTML = "Current Episode (Unavailable)";
  }

  let scope = await loadLastScope();

  // fallback if unavailable
  if (scope === "season" && !context.seasonGuid) {
    scope = "global";
  }

  if (scope === "episode" && !context.episodeGuid) {
    scope = "global";
  }

  const index = scopeOptions.indexOf(scope);

  scopeSelect.dataset.scopeValue = scope;
  [globalOption, seasonOption, episodeOption][index]!.checked = true;
  scopeSelect.style.setProperty("--segment-position", `${index * 100}%`);
}

function renderSubtitleSelect(pref: Partial<Preference>) {
  if (!manifest) return;

  subtitleSelect.innerHTML = "";

  const appendOptions = (subtitles: Subtitles, doCc: boolean) => {
    for (const sub of Object.values(subtitles)) {
      const option = document.createElement("option");

      option.value = `${sub.language}:${doCc ? "cc" : "sub"}`;
      option.dataset.language = sub.language;
      option.dataset.cc = String(doCc);

      option.textContent = `${(sub.language)}${doCc ? " [CC]" : ""}`;

      if (pref.subLanguage === sub.language && pref.doCc === doCc) {
        option.selected = true;
      }

      subtitleSelect.appendChild(option);
    }
  };

  appendOptions(manifest.subs, false);
  appendOptions(manifest.ccs, true);

  const unset = document.createElement("option");

  unset.value = "__unset__";
  unset.textContent = "<unset>";

  subtitleSelect.appendChild(unset);

  if (
    pref.subLanguage == null ||
    pref.doCc == null
  ) {
    unset.selected = true;
  }
}

function renderOffset(pref: Partial<Preference>) {
  if (pref.primaryOffsetMs == null) {
    primaryOffsetInput.value = "";
  } else {
    primaryOffsetInput.value =
      String(pref.primaryOffsetMs / 1000);
  }
  if (pref.secondaryOffsetMs == null) {
    secondaryOffsetInput.value = "";
  } else {
    secondaryOffsetInput.value =
      String(pref.secondaryOffsetMs / 1000);
  }
}

async function loadScopedPreference(): Promise<Partial<Preference>> {
  return await send<Partial<Preference>>({
    type: "GET_SCOPED_PREFERENCE",
    profileId: context.currentProfile.profileId,
    scope: scopeSelect.dataset.scopeValue as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid
  });
}

async function saveScopedPreference(pref: PreferencePatch) {
  await send({
    type: "SET_SCOPED_PREFERENCE",
    profileId: context.currentProfile.profileId,
    scope: scopeSelect.dataset.scopeValue as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid,
    pref
  });
  await browser.tabs.sendMessage(tabId, {type: "UPDATE_PREFERENCE"});
}

async function loadLastScope(): Promise<PreferenceScope> {
  const result = await browser.storage.local.get(lastScopeKey);

  const value = result[lastScopeKey];

  if (
    value === "global" ||
    value === "season" ||
    value === "episode"
  ) {
    return value;
  }

  return "global";
}

async function saveLastScope(scope: PreferenceScope): Promise<void> {
  await browser.storage.local.set({
    [lastScopeKey]: scope
  });
}

async function refreshForm() {
  const pref = await loadScopedPreference();
  console.log("pref is", pref);
  renderSubtitleSelect(pref);
  renderOffset(pref);
}

function attachListeners() {
  scopeSelect.addEventListener("change", async (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const newScope = e.target.value as PreferenceScope;
    scopeSelect.style.setProperty("--segment-position", `${scopeOptions.indexOf(newScope) * 100}%`);
    scopeSelect.dataset.scopeValue = newScope;
    await saveLastScope(scopeSelect.dataset.scopeValue as PreferenceScope);
    await refreshForm();
  });

  subtitleSelect.addEventListener("change", async () => {
    const option = subtitleSelect.selectedOptions[0];
    if (!option) return;

    if (option.value === "__unset__") {
      await saveScopedPreference({
        subLanguage: null,
        doCc: null
      });

      return;
    }

    const subLanguage = option.dataset.language;
    const doCc = option.dataset.cc === "true";

    if (!subLanguage) return;

    await saveScopedPreference({
      subLanguage,
      doCc
    });
  });

  primaryOffsetInput.addEventListener("change", async () => {
    if (primaryOffsetInput.value.trim() === "") {
      await saveScopedPreference({
        primaryOffsetMs: null
      });

      return;
    }

    const seconds = Number(primaryOffsetInput.value);

    await saveScopedPreference({
      primaryOffsetMs:
        Number.isFinite(seconds)
          ? Math.round(seconds * 1000)
          : undefined
    });
  });

  secondaryOffsetInput.addEventListener("change", async () => {
    if (secondaryOffsetInput.value.trim() === "") {
      await saveScopedPreference({
        secondaryOffsetMs: null
      });

      return;
    }

    const seconds = Number(secondaryOffsetInput.value);

    await saveScopedPreference({
      secondaryOffsetMs:
        Number.isFinite(seconds)
          ? Math.round(seconds * 1000)
          : undefined
    });
  });

  resetPositionButton.addEventListener("click", async () => {
    await saveScopedPreference({
      leftPct: undefined,
      bottomPct: undefined
    });
  });

  // collapsing the scope option section
  document.querySelector(".profile-display")!.addEventListener("click", () => {
    let s = document.querySelector('.scope-block');
    if (!(s instanceof HTMLDivElement)) return;
    s.setAttribute('collapsed', String(s.getAttribute('collapsed') === 'false'));
    void s.offsetWidth;
  });
}

const streamLimitNotice = document.querySelector("#stream-limit-notice") as HTMLDivElement;
export const loadingState = document.querySelector("#loading-state") as HTMLDivElement;

export function setLoading(isLoading: boolean) {
  loadingState.hidden = !isLoading;
  settingsContent.hidden = isLoading;
}

let cooldownTimer: number | undefined;

export function showStreamLimitNotice(blockedUntil: number) {
  clearInterval(cooldownTimer);
  loadingState.hidden = true;

  function render() {
    const remainingMs = blockedUntil - Date.now();

    if (remainingMs <= 0) {
      streamLimitNotice.hidden = true;
      clearInterval(cooldownTimer);
      init().catch(err => {
        console.error("[dual-sub popup] failed to init", err);
      });
      return;
    }

    const seconds = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    console.log(remainingMs);

    streamLimitNotice.hidden = false;
    streamLimitNotice.textContent =
      `Stream limit hit. Try again in ${mins}:${String(secs).padStart(2, "0")}.`;
    settingsContent.hidden = true;
  }

  render();
  cooldownTimer = window.setInterval(render, 1000);
}

async function init() {
  const status = await send<{ blockedUntil: number }>({
    type: "GET_PLAYBACK_BLOCK_STATUS"
  });

  if (status.blockedUntil) {
    showStreamLimitNotice(status.blockedUntil);
    return;
  }

  setLoading(true);

  const [currentTab] = await browser.tabs.query({currentWindow: true, active: true});
  console.log(currentTab);
  if (!currentTab!.url?.includes("/watch/")) {
    loadingState.textContent = "Open this on a Crunchyroll episode page.";
    return;
  }

  try {
    tabId = await getActiveCrunchyrollTabId();
    context = await send<ContextResponse>({type: "GET_CONTEXT"});
    console.log("context is", context);
    manifest = await grabManifest();
    console.log("manifest is", manifest)

    renderProfileSelect();
    await renderScopeSelect();
    await refreshForm();

    attachListeners();

    setLoading(false);
  } catch (err) {
    console.error("[dual-sub popup] failed to init");
    console.error(err);
    loadingState.textContent = "Could not load settings. Open this on a Crunchyroll episode page.";
  }
}

browser.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === "PLAYBACK_BLOCKED") {
    showStreamLimitNotice(Number(msg.blockedUntil));
  }
})

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error("[dual-sub popup] failed to init", err);
  });
});

browser.tabs.onActivated.addListener(() => {init().then()}); // switched tabs
browser.tabs.onUpdated.addListener((_, info, tab) => {
  if (info.url && tab.active) init().then(); // navigated in same tab
});
browser.runtime.onMessage.addListener((msg: any, _: any) => {
  if (msg?.type === "REFRESH_POPUP") {
    return handleRefresh();
  }
});
async function handleRefresh() {
  await init();
}