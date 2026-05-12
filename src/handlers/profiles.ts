import browser from "webextension-polyfill";
import {setNextRequestTime, sleep, waitUntil,} from "./manager";
import {
  addToAllProfiles,
  clearAllProfiles,
  getProfile,
  mapProfile,
  type Preference,
  type Profile,
  type RawProfile,
  setProfile
} from "../data/profiles";
import {findHeaderValue, getOrLoadHeaders} from "../data/headers";

export function handleProfile(data: any, tabId: number): Profile {
  const profiles: Profile[] = (data?.["profiles"] as [RawProfile]).map(a => mapProfile(a));
  let selected: Profile | null = null;
  clearAllProfiles();
  console.groupCollapsed(`[handleProfile] adding ${profiles.length} profiles`);
  for (let profile of profiles) {
    addToAllProfiles(profile);
    console.log(profile);
    if (profile.isSelected) {
      selected = profile;
    }
  }
  console.groupEnd();
  if (!selected) throw new Error("No profile selected");
  setProfile(tabId, selected);
  return selected;
}

export async function grabAndHandleProfile(tabId: number, refresh: boolean = false): Promise<Profile> {
  if (!refresh) {
    const profile = getProfile(tabId);
    if (profile) return profile;
  }
  const headers = await getOrLoadHeaders(tabId);
  if (!headers) return Promise.reject("no auth");
  if (waitUntil - performance.now() > 0) await sleep(waitUntil - performance.now());
  const response = await fetch("https://www.crunchyroll.com/accounts/v1/me/multiprofile?dual_sub=676767", {
    headers: {
      "Authorization": findHeaderValue(headers, "Authorization"),
    }
  });
  setNextRequestTime(performance.now() + 5000);
  if (!response.ok) return Promise.reject("failed to grab profile");
  return handleProfile(await response.json(), tabId);
}

export async function resolvePreference(tabId: number): Promise<Preference> {
  const rawPrefs = ((await browser.storage.sync.get("cr-dual-sub-prefs"))?.["cr-dual-sub-prefs"] ?? {}) as any;
  const profile = getProfile(tabId) ?? await grabAndHandleProfile(tabId);
  const pref: any = rawPrefs[profile.profileId];
  if (pref && "doCc" in pref && "subLanguage" in pref) return pref as Preference;
  rawPrefs[profile.profileId] = profile as Preference;
  await browser.storage.sync.set({"cr-dual-sub-prefs": rawPrefs});
  console.log(`[resolvePreference] set preference!`, rawPrefs);
  return profile;
}

export async function setPreference(tabId: number, pref: Preference) {
  const profile = getProfile(tabId) ?? await grabAndHandleProfile(tabId);
  const rawPrefs = ((await browser.storage.sync.get("cr-dual-sub-prefs"))?.["cr-dual-sub-prefs"] ?? {}) as any;
  rawPrefs[profile.profileId] = pref;
  await browser.storage.sync.set({"cr-dual-sub-prefs": rawPrefs});
  // await loadCues(tabId, pref);
  console.log(`[setPreference] set preference!`, rawPrefs);
}