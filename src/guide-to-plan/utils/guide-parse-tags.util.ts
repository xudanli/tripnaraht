const TAG_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /自驾|租车|road\s*trip/i, label: '自驾' },
  { pattern: /冬季|冬天|winter/i, label: '冬季' },
  { pattern: /夏季|夏天|summer/i, label: '夏季' },
  { pattern: /极光|aurora/i, label: '极光' },
  { pattern: /黑沙滩|black\s*sand|reynisfjara/i, label: '黑沙滩' },
  { pattern: /冰河湖|杰古沙龙|jökulsárlón|jokulsarlon/i, label: '冰河湖' },
  { pattern: /摄影|拍照|photo/i, label: '摄影' },
  { pattern: /环岛|ring\s*road/i, label: '环岛' },
  { pattern: /南岸|south\s*coast/i, label: '南岸' },
  { pattern: /冰川|glacier/i, label: '冰川' },
];

export function extractRecognizedTags(text: string): string[] {
  const tags: string[] = [];
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) tags.push(rule.label);
  }
  return [...new Set(tags)].slice(0, 8);
}
