export interface LanguageDefinition {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  hreflang: string;
}

export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', hreflang: 'en' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', hreflang: 'ar' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', hreflang: 'fr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', hreflang: 'es' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', hreflang: 'de' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr', hreflang: 'ja' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr', hreflang: 'ko' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', dir: 'ltr', hreflang: 'zh-Hans' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', dir: 'ltr', hreflang: 'zh-Hant' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', hreflang: 'pt' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr', hreflang: 'it' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', hreflang: 'ru' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr', hreflang: 'tr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr', hreflang: 'id' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', hreflang: 'hi' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr', hreflang: 'nl' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr', hreflang: 'pl' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', dir: 'ltr', hreflang: 'sv' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', dir: 'ltr', hreflang: 'no' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', dir: 'ltr', hreflang: 'da' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', dir: 'ltr', hreflang: 'fi' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', dir: 'ltr', hreflang: 'el' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', dir: 'ltr', hreflang: 'cs' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', dir: 'ltr', hreflang: 'ro' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', dir: 'ltr', hreflang: 'hu' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr', hreflang: 'uk' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr', hreflang: 'vi' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', dir: 'ltr', hreflang: 'th' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', dir: 'ltr', hreflang: 'ms' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr', hreflang: 'bn' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl', hreflang: 'ur' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl', hreflang: 'fa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl', hreflang: 'he' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr', hreflang: 'ta' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr', hreflang: 'te' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', dir: 'ltr', hreflang: 'fil' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', dir: 'ltr', hreflang: 'sw' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', dir: 'ltr', hreflang: 'af' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', dir: 'ltr', hreflang: 'ca' },
];

export const LANGUAGE_MAP = new Map<string, LanguageDefinition>(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l])
);

export function isValidLanguageCode(code: string | undefined | null): boolean {
  return Boolean(code && LANGUAGE_MAP.has(code));
}

export function getLanguageMeta(code: string | undefined | null): LanguageDefinition {
  if (code && LANGUAGE_MAP.has(code)) {
    return LANGUAGE_MAP.get(code)!;
  }
  return SUPPORTED_LANGUAGES[0];
}
