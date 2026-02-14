"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalizedText = getLocalizedText;
exports.getLocalizedTexts = getLocalizedTexts;
exports.hasLanguage = hasLanguage;
exports.getSupportedLanguages = getSupportedLanguages;
function getLocalizedText(text, lang = 'en') {
    if (!text) {
        return '';
    }
    if (typeof text === 'string') {
        return text;
    }
    if (typeof text === 'object') {
        if (lang === 'zh' && text.zh) {
            return text.zh;
        }
        if (text.en) {
            return text.en;
        }
        const values = Object.values(text);
        if (values.length > 0 && typeof values[0] === 'string') {
            return values[0];
        }
    }
    return '';
}
function getLocalizedTexts(texts, lang = 'en') {
    if (!texts) {
        return [];
    }
    if (!Array.isArray(texts)) {
        return [];
    }
    return texts.map(text => getLocalizedText(text, lang));
}
function hasLanguage(text, lang) {
    if (!text) {
        return false;
    }
    if (typeof text === 'string') {
        return lang === 'en';
    }
    if (typeof text === 'object') {
        return lang in text && !!text[lang];
    }
    return false;
}
function getSupportedLanguages(text) {
    if (!text) {
        return [];
    }
    if (typeof text === 'string') {
        return ['en'];
    }
    if (typeof text === 'object') {
        const languages = [];
        if (text.en)
            languages.push('en');
        if (text.zh)
            languages.push('zh');
        return languages;
    }
    return [];
}
//# sourceMappingURL=i18n.utils.js.map