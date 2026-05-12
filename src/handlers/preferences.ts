import type {Preference, PreferenceScope, StoredPreferences} from "../data/preferences";
import {type Profile} from "../data/profiles";
import browser from "webextension-polyfill";

export const prefKey = "cr-dual-sub-prefs";

// courtesy of GPT5.3/5.5

export async function loadStoredPreferences(): Promise<StoredPreferences> {
  const result = await browser.storage.sync.get(prefKey);
  const stored = (result[prefKey] ?? {}) as StoredPreferences;

  return {
    global: stored.global ?? {},
    seasons: stored.seasons ?? {},
    episodes: stored.episodes ?? {}
  };
}

export async function saveStoredPreferences(prefs: StoredPreferences) {
  await browser.storage.sync.set({
    [prefKey]: prefs
  });
  console.log("[saveStoredPreferences] saved prefs", prefs);
}

export function getDefaultPreference(profile: Profile): Preference {
  return {
    doCc: profile.doCc,
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
  partial: Partial<Preference>,
  seasonGuid?: string | null,
  episodeGuid?: string | null
): Promise<Preference | Partial<Preference>> {
  const prefs = await loadStoredPreferences();
  const profileId = profile.profileId;

  if (scope === "global") {
    prefs.global[profileId] = {
      ...(prefs.global[profileId] ?? getDefaultPreference(profile)),
      ...partial
    };

    await saveStoredPreferences(prefs);
    return prefs.global[profileId];
  }

  if (scope === "season") {
    if (!seasonGuid) {
      console.error("[setPreference] cannot set season preference without seasonGuid");
      return Promise.reject("[setPreference] cannot set season preference without seasonGuid");
    }

    prefs.seasons[profileId] ??= {};
    prefs.seasons[profileId][seasonGuid] = {
      ...(prefs.seasons[profileId][seasonGuid] ?? {}),
      ...partial
    };

    await saveStoredPreferences(prefs);
    return prefs.seasons[profileId][seasonGuid];
  }

  if (scope === "episode") {
    if (!episodeGuid) {
      console.error("[setPreference] cannot set episode preference without episodeGuid");
      return Promise.reject("[setPreference] cannot set episode preference without episodeGuid");
    }

    prefs.episodes[profileId] ??= {};
    prefs.episodes[profileId][episodeGuid] = {
      ...(prefs.episodes[profileId][episodeGuid] ?? {}),
      ...partial
    };

    await saveStoredPreferences(prefs);
    return prefs.episodes[profileId][episodeGuid];
  }

  return Promise.reject(`[setPreference] unknown preference scope: ${scope}`);
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

  await saveStoredPreferences(prefs);
}