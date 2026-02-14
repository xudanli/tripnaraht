import { LocalizedString, SupportedLanguage } from '../types/readiness-pack.types';
export declare function getLocalizedText(text: LocalizedString | undefined | null, lang?: SupportedLanguage): string;
export declare function getLocalizedTexts(texts: (LocalizedString | undefined | null)[] | undefined | null, lang?: SupportedLanguage): string[];
export declare function hasLanguage(text: LocalizedString | undefined | null, lang: SupportedLanguage): boolean;
export declare function getSupportedLanguages(text: LocalizedString | undefined | null): SupportedLanguage[];
