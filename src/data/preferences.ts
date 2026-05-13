export interface StoredPreferences {
  global: Record<string, Preference>;
  seasons: Record<string, Record<string, Partial<Preference>>>;
  episodes: Record<string, Record<string, Partial<Preference>>>;
}

export interface Preference {
  doCc: boolean,
  subLanguage: string,
  leftPct?: number,
  bottomPct?: number,
  subtitleOffsetMs?: number,
}

export type PreferenceScope =
  | "global"
  | "season"
  | "episode";

export type PreferencePatch = {
  [K in keyof Preference]?: Preference[K] | null;
};