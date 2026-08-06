import browser from "webextension-polyfill";
import type {Preference, PreferencePatch, PreferenceScope} from "../../data/preferences";
import type {SubtitleManifest, Subtitles} from "../../data/subtitles";
import {type ContextResponse, getActiveCrunchyrollTabId, grabManifest, send} from "./common";
import {AUDIO_LANGUAGES, type AudioLanguage, DEFAULT_SECONDARY_STATE} from "../../shared";
import FontPicker from "font-picker";
import {sleep} from "../../utils";

const lastScopeKey = "cr-dual-sub-last-scope";

// GPT-5.3/5.5 might be goated
// rah but it sucks at commenting what the hell is going on here

const profileDisplay = document.querySelector("#profile-select") as HTMLSelectElement;
const scopeSelect = document.querySelector("#scope-select") as HTMLFieldSetElement;
const subtitleSelect = document.querySelector("#subtitle-select") as HTMLSelectElement;
const primaryOffsetInput = document.querySelector("#primary-offset-input") as HTMLInputElement;
const secondaryOffsetInput = document.querySelector("#secondary-offset-input") as HTMLInputElement;
const editorOpenButton = document.querySelector("#reset-position-button") as HTMLButtonElement;
const resetSubtitleButton = document.querySelector("#reset-subtitle") as HTMLButtonElement;
const subEditContainer = document.querySelector("#sub-editor") as HTMLDivElement;
const addMaskButton = document.querySelector("#add-mask-button") as HTMLButtonElement;
const fontSizeInput = document.querySelector("#font-size") as HTMLInputElement;
// const invertMaskCheckbox = document.querySelector("#invert-masks") as HTMLInputElement;
let fontPicker: FontPicker;
const backgroundOpacityInput = document.querySelector("#background-opacity") as HTMLInputElement;

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
export let tabId: number | null;
export let context: ContextResponse | null;

function renderProfileSelect() {
  if (!context) throw new Error("context is null");
  const profile = context.currentProfile;
  profileDisplay.textContent = `${profile.profileName}`;
}

async function renderScopeSelect() {
  if (!context) throw new Error("context is null");
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

  if (scopeSelect.dataset.scopeValue as PreferenceScope === "episode") {
    // show only the possible languages
    const appendOptions = (subtitles: Subtitles, doCc: boolean) => {
      for (const key of Object.keys(subtitles)) {
        const sub = subtitles[key as keyof Subtitles];
        const option = document.createElement("option");

        option.value = `${sub.language}:${doCc ? "cc" : "sub"}`;
        option.dataset.language = sub.language;
        option.dataset.cc = String(doCc);

        option.textContent = `${(key)}${doCc ? " [CC]" : ""}`;

        if (pref.subLanguage === sub.language && pref.doCc === doCc) {
          option.selected = true;
        }

        subtitleSelect.appendChild(option);
      }
    };

    appendOptions(manifest.subs, false);
    appendOptions(manifest.ccs, true);
  } else {
    // show every possible language (global, season)
    for (const audioLang of Object.keys(AUDIO_LANGUAGES)) {
      for (const doCc of [true, false]) {
        const option = document.createElement("option");

        option.value = `${audioLang}:${doCc ? "cc" : "sub"}`;
        option.dataset.language = audioLang;
        option.dataset.cc = String(doCc);

        option.textContent = `${audioLang}${doCc ? " [CC]" : ""}`;

        if (pref.subLanguage === audioLang && pref.doCc === doCc) {
          option.selected = true;
        }

        subtitleSelect.appendChild(option);
      }
      const option = document.createElement("option");

      option.value = `${audioLang}[original]:sub`;
      option.dataset.language = `${audioLang}[original]`;
      option.dataset.cc = "false";

      option.textContent = `${audioLang}[original]`;

      if (pref.subLanguage === option.textContent && pref.doCc === false) {
        option.selected = true;
      }

      subtitleSelect.appendChild(option);
    }
  }

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

function renderMaskList(pref: Partial<Preference>) {
  if (!pref.subMask) return;
  const mask = pref.subMask;
  console.log("[dual sub pop up] rendering mask list", mask);
  subEditContainer.querySelectorAll(".mask-item").forEach(e => e.remove());
  const template = document.querySelector("#mask-item-template") as HTMLTemplateElement;
  for (let i = 0; i < mask.rects.length; i++) {
    const rect = mask.rects[i]!;
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const el = fragment.firstElementChild as HTMLElement;
    const input = el.querySelector("input")!;
    input.value = rect.name;
    input.addEventListener("change", () => {
      const oldName = rect.name;
      rect.name = input.value;
      saveScopedPreference({
        subMask: mask
      }).catch(() => input.value = oldName);
    });
    const deleteBtn = el.querySelector(".small-button")!;
    deleteBtn.addEventListener("click", (e) => {
      e.stopImmediatePropagation();
      for (let i1 = 0; i1 < mask.rects.length; i1++) {
        let r = mask.rects[i1];
        if (r?.id === rect.id) {
          // @ts-ignore
          mask.rects[i1] = null;
        }
      }
      el.remove();
      saveScopedPreference({
        subMask: mask
      }).then(() => refreshMoving());
    });
    el.dataset.maskId = String(rect.id);
    subEditContainer.appendChild(el);
  }
  // invertMaskCheckbox.checked = mask.inverted;
}

async function renderFontPicker(pref: Partial<Preference>) {
  fontPicker = fontPicker || new FontPicker(FONT_API_KEY,
    "DM Sans",
    {limit: 15, scripts: ["latin"], filter: (font) => !(["Noto Sans JP", "Material Icons"].includes(font.family))},
    (font) => {
      if (font.family === pref.fontProperty) return;
      saveScopedPreference({
        fontProperty: `"${font.family}", ${font.category}`
      })
        .then(() => console.log(`[font picker] updated font to ${font.family}`))
        .catch((e) => {
          console.error(`[font picker] failed to pick font`, font, e);
        });
    }
  );

  let count = 0;
  // wait for the stupid thing to load...
  while (count++ < 10 && fontPicker.getFonts().size < 10)
    await sleep(250);

  if (pref.fontProperty) {
    try {
      const fonts = fontPicker.getFonts();
      (window as any).fonts = fonts;
      console.log(
        `[font picker] fonts (setting "${pref.fontProperty}" from ${fonts.size} fonts)`,
        fonts,
        fonts.get(pref.fontProperty)
      );
      for (let [str, font] of fonts.entries()) {
        if (`"${font.family}", ${font.category}` === pref.fontProperty) {
          fontPicker.setActiveFont(str);
        }
      }
    } catch (e) {
      console.warn(e);
      pref.fontProperty = fontPicker.getActiveFont().family;
    }
  } else if (scopeSelect.dataset.scopeValue !== "global") {
    document.querySelector("#font-picker .dropdown-font-family")!.textContent = "none";
  }
  console.log(`[font picker] set up complete`, fontPicker.getActiveFont());
  fontSizeInput.value = String(pref.fontSize || "");
  backgroundOpacityInput.value = String(pref.backgroundOpacity || "");
}

async function loadScopedPreference(): Promise<Partial<Preference>> {
  if (!context) throw new Error("context is null");
  return await send<Partial<Preference>>({
    type: "GET_SCOPED_PREFERENCE",
    profileId: context.currentProfile.profileId,
    scope: scopeSelect.dataset.scopeValue as PreferenceScope,
    seasonGuid: context.seasonGuid,
    episodeGuid: context.episodeGuid
  }) || {};
}

async function saveScopedPreference(pref: PreferencePatch, scope?: PreferenceScope) {
  if (!tabId) throw new Error("tab id is null");
  if (!context) throw new Error("context is null");
  if (pref.subMask) pref.subMask.rects = pref.subMask.rects.filter(o => o != null);
  await send({
    type: "SET_SCOPED_PREFERENCE",
    profileId: context.currentProfile.profileId,
    scope: scope || scopeSelect.dataset.scopeValue as PreferenceScope,
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
  console.log("[dual subs pop-up] pref is", pref);
  renderSubtitleSelect(pref);
  renderOffset(pref);
  renderMaskList(pref);
  await renderFontPicker(pref);
}

function refreshMoving() {
  if (!tabId) throw new Error("tab id is null");
  loadScopedPreference().then(pref => {
    browser.tabs.sendMessage(tabId!, {type: "CREATE_MOVING", subMask: pref.subMask})
      .catch(e => console.error("[dual sub pop-up] failed to create moving on refresh", e))
      .then(() => console.log(`[refresh moving] done! (sent ${pref.subMask?.rects.length} masks)`));
  });
}

function attachListeners() {
  if (document.body.dataset.listenerAttached) return;
  document.body.dataset.listenerAttached = "true";

  scopeSelect.addEventListener("change", async (e) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const newScope = e.target.value as PreferenceScope;
    scopeSelect.style.setProperty("--segment-position", `${scopeOptions.indexOf(newScope) * 100}%`);
    scopeSelect.dataset.scopeValue = newScope;
    subEditContainer.setAttribute("collapsed", "true");
    console.log("---");
    console.log("scope changed ––––>", newScope);
    console.log("---");
    await saveLastScope(scopeSelect.dataset.scopeValue as PreferenceScope);
    await refreshForm();
    await browser.tabs.sendMessage(tabId!, {type: "CLEAR_MOVING"})
      .catch(e => console.error("[dual sub pop-up] failed to clear moving on scope change", e))
      .then(() => console.log("[scope select] cleared moving"));
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

    const subLanguage = option.dataset.language as AudioLanguage | undefined;
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

  editorOpenButton.addEventListener("click", async (e) => {
    if (!tabId) throw new Error("tab id is null");
    e.stopImmediatePropagation();
    const newCollapse = subEditContainer.getAttribute("collapsed") === "false";
    subEditContainer.setAttribute(
      "collapsed",
      String(newCollapse)
    );
    console.log("[dual sub pop-up] editor state", newCollapse);
    if (newCollapse) {
      await browser.tabs.sendMessage(tabId, {type: "CLEAR_MOVING"})
        .catch(e => console.error("[editor open] failed to clear moving on collapsing", e))
        .then(() => console.log("[editor open] cleared moving"));
      return;
    } else refreshMoving();
  });

  resetSubtitleButton.addEventListener("click", async () => {
    await saveScopedPreference({
      subtitlePos: {...DEFAULT_SECONDARY_STATE}
    }, "global");
    console.log("[dual sub pop-up] reset subtitle position");
  });

  addMaskButton.addEventListener("click", async () => {
    const pref = await loadScopedPreference();
    const mask = pref.subMask || {inverted: false, rects: []};
    const offsetter = () => (Math.random() - 0.5) / 10;
    mask.rects.push({
      id: Math.floor(Math.random() * 100000001),
      name: "Subtitle Mask",
      x: 0.5 + offsetter(),
      y: 0.5 + offsetter(),
      width: 0.1,
      height: 0.17777777778, // to make square in 640x360 aspect ratio
      rotation: 0,
    });
    pref.subMask = mask;
    await saveScopedPreference({
      subMask: mask
    }).then(async () => {
      renderMaskList(pref);
      refreshMoving();
      console.log("[add mask] done!");
    }).catch(e => console.error("[dual sub pop-up] failed to save on create new mask", e));
  });

  // collapsing the scope option section
  document.querySelector(".profile-display")!.addEventListener("click", () => {
    let s = document.querySelector('.scope-block');
    if (!(s instanceof HTMLDivElement)) return;
    s.setAttribute('collapsed', String(s.getAttribute('collapsed') === 'false'));
    void s.offsetWidth;
  });

  fontSizeInput.addEventListener("change", async () => {
    if (!fontSizeInput.value) {
      await saveScopedPreference({
        fontSize: null
      });
      return;
    }
    let fontSize = Number(fontSizeInput.value);
    if (isNaN(fontSize) || fontSize <= 0) {
      fontSize = 26;
      fontSizeInput.value = String(fontSize);
      return;
    }
    await saveScopedPreference({
      fontSize
    });
  });

  backgroundOpacityInput.addEventListener("change", async () => {
    if (!backgroundOpacityInput.value) {
      await saveScopedPreference({
        backgroundOpacity: null
      });
      return;
    }
    let opacity = Number(backgroundOpacityInput.value);
    if (isNaN(opacity) || opacity < 0 || opacity > 1) {
      opacity = 0.3;
      backgroundOpacityInput.value = String(opacity);
      return;
    }
    await saveScopedPreference({
      backgroundOpacity: opacity
    });
  });

  (document.querySelector("#font-picker")! as HTMLElement).addEventListener("contextmenu", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.querySelector("#font-picker .dropdown-font-family")!.textContent = "none";
    await saveScopedPreference({
      fontProperty: null
    });
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

async function init(force = false) {
  const status = await send<{ blockedUntil: number }>({
    type: "GET_PLAYBACK_BLOCK_STATUS"
  });

  if (status && status.blockedUntil) {
    showStreamLimitNotice(status.blockedUntil);
    return;
  }

  const [currentTab] = await browser.tabs.query({currentWindow: true, active: true});
  if (!currentTab || !currentTab!.url?.includes("/watch/")) {
    setLoading(true);
    loadingState.textContent = "Open this on a Crunchyroll episode page.";
    tabId = null;
    context = null;
    manifest = null;
    return;
  }

  try {
    tabId = await getActiveCrunchyrollTabId();
    console.log(`[dual sub popup] active tab id is ${tabId}`);

    const oldContext = context || null;
    context = await send<ContextResponse>({type: "GET_CONTEXT"});
    if (!force && oldContext && oldContext.episodeGuid === context?.episodeGuid) {
      console.log("[init] skipping re-init bruh");
      setLoading(false);
      return;
    }

    setLoading(true);

    subEditContainer.setAttribute("collapsed", "true");
    browser.tabs.sendMessage(tabId, {type: "CLEAR_MOVING"})
      .catch(e => console.error("[dual sub pop-up] failed to clear moving on init", e))
      .then(() => console.log("[init] cleared moving"));
    console.log("[dual sub popup] context is", context);
    manifest = await grabManifest();
    console.log("manifest is", manifest);

    renderProfileSelect();
    await renderScopeSelect();
    await refreshForm();

    attachListeners();

    setLoading(false);
  } catch (err) {
    console.error("[dual-sub popup] failed to init");
    console.error(err);
    // @ts-ignore
    loadingState.textContent = `Could not load settings. Open this on a Crunchyroll episode page.\n${err.toString()}`;
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

browser.tabs.onActivated.addListener(() => {
  init().then()
}); // switched tabs
browser.tabs.onUpdated.addListener((_, info, tab) => {
  if (info.url
    && (!context || !context.episodeGuid || !info.url.includes(context.episodeGuid)) // don't re-init
    && tab.active) {
    init().then(); // navigated in same tab
  }
});
browser.runtime.onMessage.addListener((msg: any, _: any) => {
  if (msg?.type === "REFRESH_POPUP") {
    return handleRefresh();
  }
  if (msg?.type === "UPDATE_MOVING") {
    return saveScopedPreference({
      subMask: msg.subMask
    });
  }
});
browser.runtime.connect({name: "sidebar-channel"});

setLoading(true);

async function handleRefresh() {
  await init(true);
}

const FONT_API_KEY = "AIzaSyD8ER9NwPVq_gfBtkOYXgMxVvfO-QtR1Q0";