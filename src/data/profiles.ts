export function getProfile(tabId: number): Profile | undefined {
  return profileMap.get(tabId);
}

export function clearAllProfiles() {
  allProfiles.clear();
}

export function addToAllProfiles(profile: Profile) {
  allProfiles.set(profile.profileId, profile);
}

export function setProfile(tabId: number, profile: Profile) {
  profileMap.set(tabId, profile);
}

export const profileMap = new Map<number, Profile>();
const allProfiles = new Map<string, Profile>;

export interface RawProfile {
  is_selected: boolean;
  preferred_content_subtitle_language: string;
  prefer_closed_captions: boolean;
  profile_id: string;
  profile_name: string;
}

export function mapProfile(raw: RawProfile): Profile {
  return {
    isSelected: raw.is_selected,
    subLanguage: raw.preferred_content_subtitle_language,
    doCc: !raw.prefer_closed_captions,
    profileId: raw.profile_id,
    profileName: raw.profile_name
  };
}

export interface Profile {
  isSelected: boolean;
  subLanguage: string;
  doCc: boolean;
  profileId: string;
  profileName: string;
}

export interface Preference {
  doCc: boolean,
  subLanguage: string,
  leftPct?: number,
  bottomPct?: number,
  subtitleOffsetMs?: number
}