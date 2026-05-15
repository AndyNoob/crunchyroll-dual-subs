export interface StoredPreferences {
  global: Record<string, Preference>;
  seasons: Record<string, Record<string, Partial<Preference>>>;
  episodes: Record<string, Record<string, Partial<Preference>>>;
}

export interface Preference {
  /**
   * use CC for secondary subtitle
   */
  doCc: boolean,
  subLanguage: string,
  leftPct?: number,
  bottomPct?: number,
  primaryOffsetMs?: number,
  secondaryOffsetMs?: number,
}

export type PreferenceScope =
  | "global"
  | "season"
  | "episode";

export type PreferencePatch = {
  [K in keyof Preference]?: Preference[K] | null;
};