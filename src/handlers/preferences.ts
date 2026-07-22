import type {Preference, PreferencePatch, PreferenceScope, StoredPreferences} from "../data/preferences";
import {type Profile} from "../data/profiles";
import browser from "webextension-polyfill";
import Bottleneck from "bottleneck";

const prefKey = "cr-dual-sub-prefs";

// courtesy of GPT5.3/5.5

let localCachedPreference: StoredPreferences | null = null;

export async function loadStoredPreferences(): Promise<StoredPreferences> {
  let stored: StoredPreferences;
  if (localCachedPreference != null) {
    console.log("[loadStoredPreferences] returning locally cached pref");
    stored = structuredClone(localCachedPreference);
  } else {
    console.log("[loadStoredPreferences] querying sync pref");
    const result = await browser.storage.sync.get(prefKey);
    stored = (result[prefKey] ?? {}) as StoredPreferences;
  }

  return {
    global: stored.global ?? {},
    seasons: stored.seasons ?? {},
    episodes: stored.episodes ?? {}
  };
}

const limiter = new Bottleneck({
  minTime: 750
});

export function saveStoredPreferences(prefs: StoredPreferences) {
  localCachedPreference = structuredClone(prefs);
  limiter.schedule(async () => {
    await browser.storage.sync.set({
      [prefKey]: prefs
    });
  }).then(() => console.debug("[saveStoredPreferences] saved prefs", prefs));
}

export function getDefaultPreference(profile: Profile): Preference {
  return {
    doCc: !profile.doCc,
    subLanguage: profile.subLanguage,
  };
}

export async function resolvePreference(
  profile: Profile,
  seasonGuid?: string,
  episodeGuid?: string
): Promise<Preference> {
  const prefs = await loadStoredPreferences();

  console.groupCollapsed("[resolvePreference] begun");
  console.log("profile is", profile);
  console.log("season guid is", seasonGuid);
  console.log("episode guid is", episodeGuid);

  let globalPref: Preference;
  const global = prefs.global[profile.profileId];

  if (global == null) {
    console.log("no global pref found, using default.");
    globalPref = getDefaultPreference(profile);
  } else {
    globalPref = global;
  }

  console.groupEnd();

  return {
    ...globalPref,
    ...(seasonGuid ? prefs.seasons[profile.profileId]?.[seasonGuid] : undefined),
    ...(episodeGuid ? prefs.episodes[profile.profileId]?.[episodeGuid] : undefined)
  };
}

export async function getScopedPreference(
  scope: PreferenceScope,
  profile: Profile,
  seasonGuid?: string,
  episodeGuid?: string
): Promise<Partial<Preference> | Preference> {
  const prefs = await loadStoredPreferences();

  if (scope === "global") {
    return prefs.global[profile.profileId] ?? getDefaultPreference(profile);
  }

  if (scope === "season") {
    if (!seasonGuid) return {};
    return prefs.seasons[profile.profileId]?.[seasonGuid] ?? {};
  }

  if (scope === "episode") {
    if (!episodeGuid) return {};
    return prefs.episodes[profile.profileId]?.[episodeGuid] ?? {};
  }

  return {};
}

export async function setPreference(
  scope: PreferenceScope,
  profile: Profile,
  partial: PreferencePatch,
  seasonGuid?: string | null,
  episodeGuid?: string | null
): Promise<Preference | Partial<Preference>> {
  const prefs = await loadStoredPreferences();
  const profileId = profile.profileId;

  if (scope === "global") {
    const existing = prefs.global[profileId] ?? getDefaultPreference(profile);

    prefs.global[profileId] = applyPreferencePatch(existing, partial) as Preference;

    saveStoredPreferences(prefs);
    return prefs.global[profileId];
  }

  if (scope === "season") {
    if (!seasonGuid) {
      throw new Error("[setPreference] cannot set season preference without seasonGuid");
    }

    prefs.seasons[profileId] ??= {};
    const existing = prefs.seasons[profileId][seasonGuid] ?? {};
    prefs.seasons[profileId][seasonGuid] = applyPreferencePatch(existing, partial);

    saveStoredPreferences(prefs);
    return prefs.seasons[profileId][seasonGuid];
  }

  if (scope === "episode") {
    if (!episodeGuid) {
      throw new Error("[setPreference] cannot set episode preference without episodeGuid");
    }

    prefs.episodes[profileId] ??= {};

    const existing = prefs.episodes[profileId][episodeGuid] ?? {};

    prefs.episodes[profileId][episodeGuid] = applyPreferencePatch(existing, partial);

    saveStoredPreferences(prefs);
    return prefs.episodes[profileId][episodeGuid];
  }

  throw new Error(`[setPreference] unknown preference scope: ${scope}`);
}

function applyPreferencePatch<T extends Partial<Preference>>(
  target: T,
  partial: PreferencePatch
): T {
  for (const [key, value] of Object.entries(partial) as [keyof Preference, any][]) {
    if (value === null) {
      delete target[key];
    } else {
      target[key] = value;
    }
  }

  return target;
}

export async function resetPreference(
  scope: PreferenceScope,
  profile: Profile,
  seasonGuid?: string,
  episodeGuid?: string
): Promise<void> {
  const prefs = await loadStoredPreferences();
  const profileId = profile.profileId;

  if (scope === "global") {
    prefs.global[profileId] = getDefaultPreference(profile);
  }

  if (scope === "season" && seasonGuid) {
    delete prefs.seasons[profileId]?.[seasonGuid];
  }

  if (scope === "episode" && episodeGuid) {
    delete prefs.episodes[profileId]?.[episodeGuid];
  }

  saveStoredPreferences(prefs);
}