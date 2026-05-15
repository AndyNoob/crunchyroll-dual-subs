import type {Profile} from "./data/profiles";
import browser from "webextension-polyfill";
import type {Preference, PreferencePatch, PreferenceScope} from "./data/preferences";
import type {SubtitleManifest, Subtitles} from "./data/subtitles";
// GPT-5.3/5.5 might be goated
type ContextResponse = {
  seasonGuid?: string;
  episodeGuid?: string;
  currentProfile: Profile;
};

const profileDisplay = document.querySelector("#profile-select") as HTMLSelectElement;
const scopeSelect = document.querySelector("#scope-select") as HTMLSelectElement;
const subtitleSelect = document.querySelector("#subtitle-select") as HTMLSelectElement;
const primaryOffsetInput = document.querySelector("#primary-offset-input") as HTMLInputElement;
const secondaryOffsetInput = document.querySelector("#secondary-offset-input") as HTMLInputElement;
const resetPositionButton = document.querySelector("#reset-position-button") as HTMLButtonElement;
const streamLimitNotice = document.querySelector("#stream-limit-notice") as HTMLDivElement;

let manifest: SubtitleManifest | null = null;

let tabId: number;
let context: ContextResponse;

const loadingState = document.querySelector("#loading-state") as HTMLDivElement;
const settingsContent = document.querySelector("#cr-dual-subs-options") as HTMLDivElement;

function setLoading(isLoading: boolean) {
  loadingState.hidden = !isLoading;
  settingsContent.hidden = isLoading;
}

async function send<T>(msg: Record<string, unknown>): Promise<T> {
  return await browser.runtime.sendMessage({
    ...msg,
    tabId
  });
}

async function grabManifest() {
  return (await send({type: "GET_MANIFEST"}).catch(r => console.warn(r))) as SubtitleManifest;
}

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

async function getActiveCrunchyrollTabId(): Promise<number> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id || !tab.url?.includes("crunchyroll.com")) {
    throw new Error("Open this popup on a Crunchyroll tab.");
  }

  return tab.id;
}

function renderProfileSelect() {
  const profile = context.currentProfile;
  profileDisplay.textContent = `${profile.profileName}`;
}

function renderScopeSelect() {
  const seasonOption = scopeSelect.querySelector('option[value="season"]') as HTMLOptionElement | null;
  const episodeOption = scopeSelect.querySelector('option[value="episode"]') as HTMLOptionElement | null;

  if (seasonOption) {
    seasonOption.disabled = !context.seasonGuid;
    seasonOption.textContent = context.seasonGuid ? "Current Season" : "Current Season (Unavailable)";
  }

  if (episodeOption) {
    episodeOption.disabled = !context.episodeGuid;
    episodeOption.textContent = context.episodeGuid ? "Current Episode" : "Current Episode (Unavailable)";
  }

  scopeSelect.value = "global";
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
    scope: scopeSelect.value as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid
  });
}

async function saveScopedPreference(pref: PreferencePatch) {
  await send({
    type: "SET_SCOPED_PREFERENCE",
    profileId: context.currentProfile.profileId,
    scope: scopeSelect.value as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid,
    pref
  });
  await browser.tabs.sendMessage(tabId, {type: "UPDATE_PREFERENCE"});
}

async function refreshForm() {
  const pref = await loadScopedPreference();
  console.log("pref is", pref);
  renderSubtitleSelect(pref);
  renderOffset(pref);
}

function attachListeners() {
  scopeSelect.addEventListener("change", async () => {
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
}

let cooldownTimer: number | undefined;

function showStreamLimitNotice(blockedUntil: number) {
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

  try {
    tabId = await getActiveCrunchyrollTabId();
    context = await send<ContextResponse>({type: "GET_CONTEXT"});
    console.log("context is", context);
    manifest = await grabManifest();
    console.log("manifest is", manifest)

    renderProfileSelect();
    renderScopeSelect();
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