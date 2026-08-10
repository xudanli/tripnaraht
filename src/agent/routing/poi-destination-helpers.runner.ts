/**
 * POI 目的地推断 / 国家澄清卡 / 去重（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import { normalizeText } from './poi-selection-geometry.runner';

export function inferCountryFromDestination(destination: string): string | undefined {
  const d = normalizeText(destination);
  if (!d) return undefined;
  if (/^gl$/i.test(d.trim()) || /格陵兰|greenland|nuuk|ilulissat|伊卢利萨特|迪斯科|disko/.test(d)) {
    return 'GL';
  }
  if (/^sj$/i.test(d.trim()) || /斯瓦尔巴|svalbard|longyearbyen|朗伊尔/.test(d)) {
    return 'SJ';
  }
  if (/东京|大阪|京都|日本|tokyo|osaka|kyoto|japan/.test(d)) return 'JP';
  if (/首尔|韩国|seoul|korea/.test(d)) return 'KR';
  if (/上海|北京|广州|深圳|杭州|成都|重庆|中国|china/.test(d)) return 'CN';
  /** 冰岛：POI_SELECTION / poiPlanning 冰岛分支依赖 ISO 国家码 IS */
  if (/^is$/i.test(d.trim()) || /冰岛|iceland|reykjav[ií]k|雷克雅未克/.test(d)) return 'IS';
  if (/^[a-z]{2}$/i.test(d.trim())) return d.trim().toUpperCase();
  return undefined;
}

export function countryDisplayName(countryCode?: string): string {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return '国家/地区';
  const map: Record<string, string> = {
    JP: '日本',
    KR: '韩国',
    CN: '中国',
    US: '美国',
    GB: '英国',
    FR: '法国',
    DE: '德国',
    IT: '意大利',
    ES: '西班牙',
    IS: '冰岛',
    GL: '格陵兰',
    SJ: '斯瓦尔巴',
  };
  return map[code] ?? code;
}

export function toStableOptionValue(destination: string, countryCode: string): string {
  const normalized = normalizeText(destination)
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5]/g, '');
  return `${normalized || 'destination'}_${countryCode.toLowerCase()}`;
}

export function buildPoiCountryClarificationQuestion(
  destination: string,
  destinationCountry: string,
): Record<string, unknown> {
  const normalizedDestination = destination?.trim() || '该目的地';
  const countryLabel = countryDisplayName(destinationCountry);
  const quickOptionLabel = `${normalizedDestination} ${countryLabel}`;
  const quickOptionValue = toStableOptionValue(normalizedDestination, destinationCountry);

  return {
    id: 'question-poi-country',
    question: '请确认目的地国家/城市',
    type: 'single_choice',
    options: [
      { value: quickOptionValue, label: quickOptionLabel },
      { value: 'manual', label: '其他（手动输入）' },
    ],
    required: true,
    hint: '用于限制 POI 检索范围，避免匹配到同名异地',
    conditionalInputs: [
      {
        triggerValue: 'manual',
        inputType: 'text',
        label: '请输入目的地国家/城市',
        placeholder: `例如：${normalizedDestination}, ${countryLabel}`,
        required: true,
        hint: '建议格式：城市 + 国家',
        paramKey: 'destination_disambiguation',
      },
    ],
  };
}

export function dedupePois(pois: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const poi of pois) {
    const key = [
      String(poi?.place_id ?? poi?.id ?? ''),
      String(poi?.name ?? poi?.nameCN ?? '').trim().toLowerCase(),
      String(poi?.address ?? '').trim().toLowerCase(),
    ].join('|');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(poi);
  }
  return out;
}
