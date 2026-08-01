import type {RectState} from "@andynoob/move-it";

export const DEFAULT_SECONDARY_STATE: RectState = {
  x: 0.5,
  y: 0.95,
  width: 0,
  height: 0,
  rotation: 0
};

// retrieved from https://static.crunchyroll.com/config/i18n/v3/audio_languages.json
export const AUDIO_LANGUAGES = {
  "en-US": "English",
  "en-IN": "English (India)",
  "id-ID": "Bahasa Indonesia",
  "ms-MY": "Bahasa Melayu",
  "ca-ES": "Català",
  "de-DE": "Deutsch",
  "es-419": "Español (América Latina)",
  "es-ES": "Español (España)",
  "fr-FR": "Français",
  "it-IT": "Italiano",
  "pl-PL": "Polski",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  "vi-VN": "Tiếng Việt",
  "tr-TR": "Türkçe",
  "ru-RU": "Русский",
  "ar-SA": "العربية",
  "hi-IN": "हिंदी",
  "ta-IN": "தமிழ்",
  "te-IN": "తెలుగు",
  "zh-CN": "中文 (普通话)",
  "zh-HK": "中文 (粵語)",
  "zh-TW": "中文 (國語)",
  "ko-KR": "한국어",
  "th-TH": "ไทย",
  "none": "None"
};

export type AudioLanguage = keyof typeof AUDIO_LANGUAGES;