import {
  addToAllProfiles,
  clearAllProfiles,
  getProfile,
  mapProfile,
  type Profile,
  type RawProfile,
  setProfile
} from "../data/profiles";
import {findHeaderValue, getOrLoadHeaders} from "../data/headers";
import {setNextRequestTime, singleFlight, sleep, waitUntil} from "../utils";

export function handleProfiles(tabId: number, data: any): Profile {
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

export const grabSelectedProfile = singleFlight(
  grabAndHandleProfiles,
  (tabId, _ = false) => tabId.toString()
);

async function grabAndHandleProfiles(tabId: number, refresh: boolean = false): Promise<Profile> {
  if (!refresh) {
    const profile = getProfile(tabId);
    if (profile) {
      console.log("[grabAndHandleProfiles] profile already exists, not refreshing.");
      return profile;
    }
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
  return handleProfiles(tabId, await response.json());
}

