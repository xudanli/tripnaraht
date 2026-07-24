/**
 * 极光槽位选日澄清卡：RAG 摘录格式化（INTAKE 短路路径专用，非 DATA_LOOKUP 轻量问答）。
 */

import { sanitizeIndexedChunkMarkdownForDisplay } from './user-clarification-markdown.util';

export const AURORA_SLOT_RAG_POIS_QUERY =
  '冰岛 极光观测点 Grótta 暗空 aurora viewing spot northern lights 教堂 beach 杰古沙龙';

export const AURORA_SLOT_RAG_PRACTICAL_QUERY =
  '冰岛 极光 观测 季节 月份 KP 云量 预报 夜间 注意事项 冬季';

const AURORA_RAG_RELEVANCE_TERMS = [
  '极光',
  'aurora',
  'northern lights',
  '北极光',
  '观测点',
  '观测',
  '暗空',
  '光害',
  'grótta',
  'grotta',
  'kp',
  '云量',
  'dark sky',
  'viewing spot',
];

const AURORA_RAG_NOISE_TERMS = [
  '餐饮',
  '餐厅',
  '米其林',
  '超市',
  'bonus',
  'bónus',
  '补给指南',
  '装备指南',
  '洋葱式',
  '穿衣法',
  '路线选择决策',
  '预算与补给',
];

export const AURORA_SLOT_RAG_STATIC_FALLBACK_LINES = [
  '· **南岸暗空区**：Vík 外围、杰古沙龙冰河湖周边光害较低，适合作为观测备选。',
  '· **首都近郊**：Grótta 灯塔（雷克雅未克西北）为常见近城观测点；需关注云量与海风。',
  '· **季节提示**：9–3 月夜长更利于观测；请结合 KP 与云量预报，预留 22:00 后弹性窗口。',
];

export type AuroraSlotRagChunkLike = {
  content: string;
  documentTitle: string;
};

export function scoreAuroraRagChunkRelevance(content: string, documentTitle: string): number {
  const text = `${documentTitle}\n${content}`.toLowerCase();
  let score = 0;
  for (const term of AURORA_RAG_RELEVANCE_TERMS) {
    if (text.includes(term.toLowerCase())) score += 2;
  }
  for (const term of AURORA_RAG_NOISE_TERMS) {
    if (text.includes(term.toLowerCase())) score -= 4;
  }
  return score;
}

export function filterAndRankAuroraRagChunks(
  chunks: AuroraSlotRagChunkLike[],
  max: number,
): AuroraSlotRagChunkLike[] {
  return chunks
    .map((c) => ({ c, score: scoreAuroraRagChunkRelevance(c.content, c.documentTitle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((row) => row.c);
}

export function mapChunkToAuroraSlotRagEntry(
  content: string,
  documentTitle: string,
): AuroraSlotRagChunkLike {
  return {
    content: sanitizeIndexedChunkMarkdownForDisplay(String(content ?? '').trim()),
    documentTitle: String(documentTitle ?? '').trim() || '知识库摘录',
  };
}

/** 将 POI + 实操检索结果格式化为澄清卡内「知识库参考」小节 */
export function buildAuroraSlotPlacementRagSection(
  pois: AuroraSlotRagChunkLike[],
  practical: AuroraSlotRagChunkLike[],
): { supplementZh: string | null; relevantCount: number; usedStaticFallback: boolean } {
  const rankedPois = filterAndRankAuroraRagChunks(pois, 3);
  const rankedPractical = filterAndRankAuroraRagChunks(practical, 2);
  const ranked = [...rankedPois, ...rankedPractical];
  const lines: string[] = [];

  for (const row of rankedPois) {
    const body = sanitizeIndexedChunkMarkdownForDisplay(row.content, 320);
    if (!body) continue;
    lines.push(`· **${row.documentTitle}**：${body}`);
  }
  for (const row of rankedPractical) {
    const body = sanitizeIndexedChunkMarkdownForDisplay(row.content, 280);
    if (!body) continue;
    lines.push(`· **${row.documentTitle}**：${body}`);
  }

  if (lines.length === 0) {
    return {
      supplementZh: AURORA_SLOT_RAG_STATIC_FALLBACK_LINES.join('\n'),
      relevantCount: 0,
      usedStaticFallback: true,
    };
  }
  return {
    supplementZh: lines.join('\n'),
    relevantCount: lines.length,
    usedStaticFallback: false,
  };
}

/** @deprecated 使用 buildAuroraSlotPlacementRagSection */
export function formatAuroraSlotPlacementRagSectionZh(
  pois: AuroraSlotRagChunkLike[],
  practical: AuroraSlotRagChunkLike[],
): string | null {
  return buildAuroraSlotPlacementRagSection(pois, practical).supplementZh;
}
