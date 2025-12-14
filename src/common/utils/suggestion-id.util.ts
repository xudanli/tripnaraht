// src/common/utils/suggestion-id.util.ts

/**
 * FNV-1a 32位 hash 算法（快速、稳定）
 * 
 * 用于生成稳定的建议 ID，相同输入产生相同 hash
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }

  // 返回 8 位十六进制字符串
  return hash.toString(16).padStart(8, '0');
}

/**
 * 生成稳定的建议 ID
 * 
 * 规则：
 * - 用于回放、审计、hash、seed
 * - 必须基于输入参数生成，确保相同输入产生相同 ID
 * - 格式：{prefix}:{hash}
 * 
 * @param prefix 前缀（如 "voice", "vision"）
 * @param stableKey 稳定键（用于 hash 的输入字符串）
 */
export function buildSuggestionId(
  prefix: 'voice' | 'vision',
  stableKey: string
): string {
  // 规范化 stableKey（去除前后空格，统一大小写）
  const normalizedKey = stableKey.trim().toLowerCase();
  const hash = fnv1a32(normalizedKey);
  return `${prefix}:${hash}`;
}

/**
 * 为语音解析生成建议 ID
 * 
 * stableKey 格式：actionType|poiId|transcript
 * - 如果无 poiId：actionType|transcript
 * - 如果无 transcript：actionType|poiId
 */
export function generateVoiceSuggestionId(
  actionType: string,
  poiId?: string,
  transcript?: string
): string {
  const parts: string[] = [actionType];
  if (poiId) parts.push(poiId);
  if (transcript) parts.push(transcript);
  const stableKey = parts.join('|');
  return buildSuggestionId('voice', stableKey);
}

/**
 * 为视觉推荐生成建议 ID
 * 
 * stableKey 格式：poiId|ocrTextNormalized
 * - 规范化 OCR 文本（去除换行、多余空格，转小写）
 */
export function generateVisionSuggestionId(poiId: string, ocrText?: string): string {
  let stableKey = poiId;
  if (ocrText) {
    // 规范化 OCR 文本：去除换行、多余空格，转小写
    const normalized = ocrText
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    stableKey = `${poiId}|${normalized}`;
  }
  return buildSuggestionId('vision', stableKey);
}

/**
 * 生成澄清建议 ID
 */
export function generateClarificationSuggestionId(actionType: string): string {
  return buildSuggestionId('voice', `${actionType}:clarify`);
}
