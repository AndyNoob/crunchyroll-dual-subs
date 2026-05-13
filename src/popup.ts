import type {Profile} from "./data/profiles";
import browser from "webextension-polyfill";
import type {Preference, PreferenceScope} from "./data/preferences";
import type {EpisodeManifest, Subtitles} from "./data/subtitles";
// GPT-5.3/5.5 might be goated
type ContextResponse = {
  seasonGuid?: string;
  episodeGuid?: string;
  currentProfile: Profile;
};

const profileSelect = document.querySelector("#profile-select") as HTMLSelectElement;
const scopeSelect = document.querySelector("#scope-select") as HTMLSelectElement;
const subtitleSelect = document.querySelector("#subtitle-select") as HTMLSelectElement;
const offsetInput = document.querySelector("#offset-input") as HTMLInputElement;
const resetPositionButton = document.querySelector("#reset-position-button") as HTMLButtonElement;

let manifest: EpisodeManifest | null = null;

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
  return (await send({type: "GET_MANIFEST"}).catch(r => console.warn(r))) as EpisodeManifest;
}

function formatLocale(locale: string) {
  try {
    return new Intl.DisplayNames(
      ["en"],
      { type: "language" }
    ).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

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

  profileSelect.innerHTML = "";

  const option = document.createElement("option");
  option.value = profile.profileId;
  option.textContent = profile.profileName;

  profileSelect.appendChild(option);
  profileSelect.value = profile.profileId;
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

      option.textContent = `${formatLocale(sub.language)}${doCc ? " [CC]" : ""}`;

      if (pref.subLanguage === sub.language && pref.doCc === doCc) {
        option.selected = true;
      }

      subtitleSelect.appendChild(option);
    }
  };

  appendOptions(manifest.subs, false);
  appendOptions(manifest.ccs, true);
}

function renderOffset(pref: Partial<Preference>) {
  offsetInput.value = String((pref.subtitleOffsetMs ?? 0) / 1000);
}

async function loadScopedPreference(): Promise<Partial<Preference>> {
  return await send<Partial<Preference>>({
    type: "GET_SCOPED_PREFERENCE",
    profileId: profileSelect.value,
    scope: scopeSelect.value as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid
  });
}

async function saveScopedPreference(pref: Partial<Preference>) {
  await send({
    type: "SET_SCOPED_PREFERENCE",
    profileId: profileSelect.value,
    scope: scopeSelect.value as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid,
    pref
  });
}

async function refreshForm() {
  const pref = await loadScopedPreference();

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

    const subLanguage = option.dataset.language;
    const doCc = option.dataset.cc === "true";

    if (!subLanguage) return;

    await saveScopedPreference({
      subLanguage,
      doCc
    });

    await browser.tabs.sendMessage(tabId, {
      type: "UPDATE_PREFERENCE"
    });
  });

  offsetInput.addEventListener("change", async () => {
    const seconds = Number(offsetInput.value);

    await saveScopedPreference({
      subtitleOffsetMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0
    });
  });

  resetPositionButton.addEventListener("click", async () => {
    await saveScopedPreference({
      leftPct: undefined,
      bottomPct: undefined
    });
  });
}

async function init() {
  setLoading(true);

  try {
    tabId = await getActiveCrunchyrollTabId();
    context = await send<ContextResponse>({ type: "GET_CONTEXT" });
    manifest = await grabManifest();

    renderProfileSelect();
    renderScopeSelect();
    await refreshForm();

    attachListeners();

    setLoading(false);
  } catch (err) {
    console.error("[dual-sub popup] failed to init", err);
    loadingState.textContent = "Could not load settings. Open this on a Crunchyroll episode page.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(err => {
    console.error("[dual-sub popup] failed to init", err);
  });
});