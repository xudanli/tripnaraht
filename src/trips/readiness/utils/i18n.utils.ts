// src/trips/readiness/utils/i18n.utils.ts

/**
 * 多语言工具函数
 * 
 * 用于从 LocalizedString 中根据语言获取文本
 */

import { LocalizedString, SupportedLanguage } from '../types/readiness-pack.types';

/**
 * 从 LocalizedString 中获取指定语言的文本
 * 
 * @param text - 本地化字符串（可以是字符串或多语言对象）
 * @param lang - 目标语言（默认 'en'）
 * @returns 对应语言的文本
 * 
 * @example
 * ```typescript
 * getLocalizedText("Hello", "zh") // "Hello" (字符串直接返回)
 * getLocalizedText({ en: "Hello", zh: "你好" }, "zh") // "你好"
 * getLocalizedText({ en: "Hello" }, "zh") // "Hello" (回退到英文)
 * ```
 */
export function getLocalizedText(
  text: LocalizedString | undefined | null,
  lang: SupportedLanguage = 'en'
): string {
  if (!text) {
    return '';
  }

  // 如果是字符串，直接返回（向后兼容）
  if (typeof text === 'string') {
    return text;
  }

  // 如果是多语言对象
  if (typeof text === 'object') {
    // 优先返回请求的语言
    if (lang === 'zh' && text.zh) {
      return text.zh;
    }
    
    // 回退到英文
    if (text.en) {
      return text.en;
    }
    
    // 如果英文也没有，返回第一个可用的值
    const values = Object.values(text);
    if (values.length > 0 && typeof values[0] === 'string') {
      return values[0];
    }
  }

  return '';
}

/**
 * 批量获取本地化文本
 * 
 * @param texts - 本地化字符串数组
 * @param lang - 目标语言（默认 'en'）
 * @returns 对应语言的文本数组
 */
export function getLocalizedTexts(
  texts: (LocalizedString | undefined | null)[] | undefined | null,
  lang: SupportedLanguage = 'en'
): string[] {
  // 如果 texts 为 undefined 或 null，返回空数组
  if (!texts) {
    return [];
  }
  
  // 如果不是数组，返回空数组
  if (!Array.isArray(texts)) {
    return [];
  }
  
  return texts.map(text => getLocalizedText(text, lang));
}

/**
 * 检查 LocalizedString 是否包含指定语言
 * 
 * @param text - 本地化字符串
 * @param lang - 目标语言
 * @returns 是否包含该语言
 */
export function hasLanguage(
  text: LocalizedString | undefined | null,
  lang: SupportedLanguage
): boolean {
  if (!text) {
    return false;
  }

  if (typeof text === 'string') {
    // 字符串默认视为英文
    return lang === 'en';
  }

  if (typeof text === 'object') {
    return lang in text && !!text[lang];
  }

  return false;
}

/**
 * 获取 LocalizedString 支持的所有语言
 * 
 * @param text - 本地化字符串
 * @returns 支持的语言列表
 */
export function getSupportedLanguages(
  text: LocalizedString | undefined | null
): SupportedLanguage[] {
  if (!text) {
    return [];
  }

  if (typeof text === 'string') {
    return ['en'];
  }

  if (typeof text === 'object') {
    const languages: SupportedLanguage[] = [];
    if (text.en) languages.push('en');
    if (text.zh) languages.push('zh');
    return languages;
  }

  return [];
}

