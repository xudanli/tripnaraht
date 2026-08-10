/**
 * 从用户消息提取 ISO 国家码：最长别名优先；两位码仅完整 token。
 * 禁止对 us/al/ar 等做裸 substring（避免 Australia→US、travel→AL）。
 */

export type DestinationRegionHint = {
  entityType: 'REGION';
  regionCode: 'ALPS';
  countries: readonly string[];
};

const ALPS_REGION: DestinationRegionHint = {
  entityType: 'REGION',
  regionCode: 'ALPS',
  countries: ['FR', 'CH', 'IT', 'AT', 'DE', 'SI'],
};

/** 国家名 / 城市别名 → ISO（不含两位码裸串、不含跨国区域伪码） */
const NAME_ALIASES: Array<{ alias: string; code: string }> = [
  { alias: 'united states', code: 'US' },
  { alias: 'new zealand', code: 'NZ' },
  { alias: 'french polynesia', code: 'PF' },
  { alias: '法属波利尼西亚', code: 'PF' },
  { alias: 'iceland', code: 'IS' },
  { alias: '冰岛', code: 'IS' },
  { alias: 'china', code: 'CN' },
  { alias: '中国', code: 'CN' },
  { alias: 'japan', code: 'JP' },
  { alias: '日本', code: 'JP' },
  { alias: 'usa', code: 'US' },
  { alias: '美国', code: 'US' },
  { alias: '新西兰', code: 'NZ' },
  { alias: 'tahiti', code: 'PF' },
  { alias: '大溪地', code: 'PF' },
  { alias: 'thailand', code: 'TH' },
  { alias: '泰国', code: 'TH' },
  { alias: 'singapore', code: 'SG' },
  { alias: '新加坡', code: 'SG' },
  { alias: 'korea', code: 'KR' },
  { alias: '韩国', code: 'KR' },
  { alias: 'malaysia', code: 'MY' },
  { alias: '马来西亚', code: 'MY' },
  { alias: 'vietnam', code: 'VN' },
  { alias: '越南', code: 'VN' },
  { alias: 'greenland', code: 'GL' },
  { alias: '格陵兰', code: 'GL' },
  { alias: 'svalbard', code: 'SJ' },
  { alias: '斯瓦尔巴', code: 'SJ' },
  { alias: 'argentina', code: 'AR' },
  { alias: '阿根廷', code: 'AR' },
  { alias: 'australia', code: 'AU' },
  { alias: '澳大利亚', code: 'AU' },
  { alias: '澳洲', code: 'AU' },
  { alias: 'sydney', code: 'AU' },
  { alias: '悉尼', code: 'AU' },
  { alias: 'melbourne', code: 'AU' },
  { alias: '墨尔本', code: 'AU' },
  { alias: 'tokyo', code: 'JP' },
  { alias: '东京', code: 'JP' },
  { alias: 'osaka', code: 'JP' },
  { alias: '大阪', code: 'JP' },
  { alias: 'kyoto', code: 'JP' },
  { alias: '京都', code: 'JP' },
  { alias: 'beijing', code: 'CN' },
  { alias: '北京', code: 'CN' },
  { alias: 'shanghai', code: 'CN' },
  { alias: '上海', code: 'CN' },
  { alias: 'reykjavik', code: 'IS' },
  { alias: '雷克雅未克', code: 'IS' },
];

const ISO_TOKEN_CODES = new Set([
  'IS',
  'CN',
  'JP',
  'US',
  'NZ',
  'PF',
  'TH',
  'SG',
  'KR',
  'MY',
  'VN',
  'GL',
  'SJ',
  'AR',
  'AU',
]);

const ALPS_ALIASES = ['阿尔卑斯山', '阿尔卑斯', 'alps'];

const SORTED_NAME_ALIASES = [...NAME_ALIASES].sort((a, b) => b.alias.length - a.alias.length);

function normalizeForMatch(message: string): string {
  return message.toLowerCase();
}

/** 跨国区域（阿尔卑斯等）：不伪装成国家码 */
export function detectDestinationRegionHint(message: string): DestinationRegionHint | undefined {
  if (!message?.trim()) return undefined;
  const lower = normalizeForMatch(message);
  const hit = [...ALPS_ALIASES].sort((a, b) => b.length - a.length).some((a) => lower.includes(a));
  return hit ? ALPS_REGION : undefined;
}

/**
 * 从自然语言提取 ISO 国家码。
 * - 最长别名优先
 * - 两位码仅完整 token
 * - Alps 等区域返回 undefined（可用 detectDestinationRegionHint）
 */
export function extractCountryCodeFromMessage(message: string): string | undefined {
  if (!message?.trim()) return undefined;
  if (detectDestinationRegionHint(message)) return undefined;

  const lower = normalizeForMatch(message);

  for (const { alias, code } of SORTED_NAME_ALIASES) {
    if (lower.includes(alias)) return code;
  }

  // 两位 ISO：完整 token（空格/标点边界），大小写不敏感
  const tokenRe = /(^|[\s,，/|\-_(（])([A-Za-z]{2})(?=$|[\s,，/|\-_)）])/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(message)) !== null) {
    const code = m[2].toUpperCase();
    if (ISO_TOKEN_CODES.has(code)) return code;
  }

  return undefined;
}
