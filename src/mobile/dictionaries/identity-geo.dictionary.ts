/**
 * Personal-center geo dictionaries for identity pickers.
 * nationality: ISO 3166-1 alpha-2
 * residencyRegion: ISO 3166-2 where available (e.g. CN-SH), else country code
 */

export interface IdentityCodeLabel {
  code: string;
  nameZh: string;
  nameEn: string;
  countryCode?: string;
}

/** Common BCP-47 locales for preferredLanguage. */
export const IDENTITY_PREFERRED_LANGUAGES: IdentityCodeLabel[] = [
  { code: 'zh-Hans', nameZh: '简体中文', nameEn: 'Simplified Chinese' },
  { code: 'zh-Hant', nameZh: '繁體中文', nameEn: 'Traditional Chinese' },
  { code: 'en', nameZh: '英语', nameEn: 'English' },
  { code: 'ja', nameZh: '日语', nameEn: 'Japanese' },
  { code: 'ko', nameZh: '韩语', nameEn: 'Korean' },
  { code: 'is', nameZh: '冰岛语', nameEn: 'Icelandic' },
  { code: 'de', nameZh: '德语', nameEn: 'German' },
  { code: 'fr', nameZh: '法语', nameEn: 'French' },
  { code: 'es', nameZh: '西班牙语', nameEn: 'Spanish' },
];

/**
 * China first-level admin divisions (ISO 3166-2:CN).
 * Used for residencyRegion picker when country is CN.
 */
export const CN_RESIDENCY_REGIONS: IdentityCodeLabel[] = [
  { code: 'CN-BJ', nameZh: '北京', nameEn: 'Beijing', countryCode: 'CN' },
  { code: 'CN-TJ', nameZh: '天津', nameEn: 'Tianjin', countryCode: 'CN' },
  { code: 'CN-HE', nameZh: '河北', nameEn: 'Hebei', countryCode: 'CN' },
  { code: 'CN-SX', nameZh: '山西', nameEn: 'Shanxi', countryCode: 'CN' },
  { code: 'CN-NM', nameZh: '内蒙古', nameEn: 'Inner Mongolia', countryCode: 'CN' },
  { code: 'CN-LN', nameZh: '辽宁', nameEn: 'Liaoning', countryCode: 'CN' },
  { code: 'CN-JL', nameZh: '吉林', nameEn: 'Jilin', countryCode: 'CN' },
  { code: 'CN-HL', nameZh: '黑龙江', nameEn: 'Heilongjiang', countryCode: 'CN' },
  { code: 'CN-SH', nameZh: '上海', nameEn: 'Shanghai', countryCode: 'CN' },
  { code: 'CN-JS', nameZh: '江苏', nameEn: 'Jiangsu', countryCode: 'CN' },
  { code: 'CN-ZJ', nameZh: '浙江', nameEn: 'Zhejiang', countryCode: 'CN' },
  { code: 'CN-AH', nameZh: '安徽', nameEn: 'Anhui', countryCode: 'CN' },
  { code: 'CN-FJ', nameZh: '福建', nameEn: 'Fujian', countryCode: 'CN' },
  { code: 'CN-JX', nameZh: '江西', nameEn: 'Jiangxi', countryCode: 'CN' },
  { code: 'CN-SD', nameZh: '山东', nameEn: 'Shandong', countryCode: 'CN' },
  { code: 'CN-HA', nameZh: '河南', nameEn: 'Henan', countryCode: 'CN' },
  { code: 'CN-HB', nameZh: '湖北', nameEn: 'Hubei', countryCode: 'CN' },
  { code: 'CN-HN', nameZh: '湖南', nameEn: 'Hunan', countryCode: 'CN' },
  { code: 'CN-GD', nameZh: '广东', nameEn: 'Guangdong', countryCode: 'CN' },
  { code: 'CN-GX', nameZh: '广西', nameEn: 'Guangxi', countryCode: 'CN' },
  { code: 'CN-HI', nameZh: '海南', nameEn: 'Hainan', countryCode: 'CN' },
  { code: 'CN-CQ', nameZh: '重庆', nameEn: 'Chongqing', countryCode: 'CN' },
  { code: 'CN-SC', nameZh: '四川', nameEn: 'Sichuan', countryCode: 'CN' },
  { code: 'CN-GZ', nameZh: '贵州', nameEn: 'Guizhou', countryCode: 'CN' },
  { code: 'CN-YN', nameZh: '云南', nameEn: 'Yunnan', countryCode: 'CN' },
  { code: 'CN-XZ', nameZh: '西藏', nameEn: 'Tibet', countryCode: 'CN' },
  { code: 'CN-SN', nameZh: '陕西', nameEn: 'Shaanxi', countryCode: 'CN' },
  { code: 'CN-GS', nameZh: '甘肃', nameEn: 'Gansu', countryCode: 'CN' },
  { code: 'CN-QH', nameZh: '青海', nameEn: 'Qinghai', countryCode: 'CN' },
  { code: 'CN-NX', nameZh: '宁夏', nameEn: 'Ningxia', countryCode: 'CN' },
  { code: 'CN-XJ', nameZh: '新疆', nameEn: 'Xinjiang', countryCode: 'CN' },
  { code: 'CN-HK', nameZh: '香港', nameEn: 'Hong Kong', countryCode: 'CN' },
  { code: 'CN-MO', nameZh: '澳门', nameEn: 'Macao', countryCode: 'CN' },
  { code: 'CN-TW', nameZh: '台湾', nameEn: 'Taiwan', countryCode: 'CN' },
];

/** Extra curated regions for frequent traveler countries (ISO 3166-2). */
export const EXTRA_RESIDENCY_REGIONS: IdentityCodeLabel[] = [
  // Japan — major prefectures / metro
  { code: 'JP-13', nameZh: '东京都', nameEn: 'Tokyo', countryCode: 'JP' },
  { code: 'JP-27', nameZh: '大阪府', nameEn: 'Osaka', countryCode: 'JP' },
  { code: 'JP-14', nameZh: '神奈川县', nameEn: 'Kanagawa', countryCode: 'JP' },
  { code: 'JP-23', nameZh: '爱知县', nameEn: 'Aichi', countryCode: 'JP' },
  { code: 'JP-01', nameZh: '北海道', nameEn: 'Hokkaido', countryCode: 'JP' },
  // Iceland — country-level is enough for most; keep capital region
  { code: 'IS-1', nameZh: '首都区', nameEn: 'Capital Region', countryCode: 'IS' },
  { code: 'IS-2', nameZh: '南部区', nameEn: 'Southern Peninsula', countryCode: 'IS' },
  { code: 'IS-3', nameZh: '西部区', nameEn: 'Western Region', countryCode: 'IS' },
  { code: 'IS-4', nameZh: '西峡湾', nameEn: 'Westfjords', countryCode: 'IS' },
  { code: 'IS-5', nameZh: '西北区', nameEn: 'Northwestern Region', countryCode: 'IS' },
  { code: 'IS-6', nameZh: '东北区', nameEn: 'Northeastern Region', countryCode: 'IS' },
  { code: 'IS-7', nameZh: '东部区', nameEn: 'Eastern Region', countryCode: 'IS' },
  { code: 'IS-8', nameZh: '南部区（Suðurland）', nameEn: 'Southern Region', countryCode: 'IS' },
  // US — common states
  { code: 'US-CA', nameZh: '加利福尼亚', nameEn: 'California', countryCode: 'US' },
  { code: 'US-NY', nameZh: '纽约州', nameEn: 'New York', countryCode: 'US' },
  { code: 'US-WA', nameZh: '华盛顿州', nameEn: 'Washington', countryCode: 'US' },
  { code: 'US-TX', nameZh: '得克萨斯', nameEn: 'Texas', countryCode: 'US' },
  { code: 'US-MA', nameZh: '马萨诸塞', nameEn: 'Massachusetts', countryCode: 'US' },
];

export const ALL_CURATED_RESIDENCY_REGIONS: IdentityCodeLabel[] = [
  ...CN_RESIDENCY_REGIONS,
  ...EXTRA_RESIDENCY_REGIONS,
];

export function listResidencyRegions(countryCode?: string | null): IdentityCodeLabel[] {
  const cc = countryCode?.trim().toUpperCase();
  if (!cc) return ALL_CURATED_RESIDENCY_REGIONS;
  return ALL_CURATED_RESIDENCY_REGIONS.filter((r) => r.countryCode === cc);
}

export function isKnownNationalityCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code.trim().toUpperCase());
}

export function isKnownResidencyRegionCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return true; // allow country-level residency
  if (ALL_CURATED_RESIDENCY_REGIONS.some((r) => r.code === c)) return true;
  // Accept other ISO 3166-2 shaped codes for forward compatibility
  return /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(c);
}
