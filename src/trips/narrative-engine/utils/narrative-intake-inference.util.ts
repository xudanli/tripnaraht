/**
 * 从自然语言输入推断 Narrative Intake（quick-plan / route-and-run 零摩擦入口）
 */

import type { NarrativeIntakeInput } from '../types/travel-storyform.types';
import type { TravelMotivation } from '../types/narrative-arc.types';

const MOTIVATION_PATTERNS: Array<{ motivation: TravelMotivation; patterns: RegExp[] }> = [
  { motivation: 'rest', patterns: [/休息|放松|疗愈|恢复|太累|疲惫|rest|relax/i] },
  { motivation: 'discovery', patterns: [/探索|发现|未知|好奇|discovery|explore/i] },
  { motivation: 'connection', patterns: [/连接|陪伴|一起|文化|人文|connection|together/i] },
  { motivation: 'challenge', patterns: [/挑战|冒险|突破|challenge|adventure/i] },
  { motivation: 'celebration', patterns: [/庆祝|纪念|生日|周年|celebration/i] },
  { motivation: 'closure', patterns: [/告别|结束|closure|重新开始/i] },
];

const MOOD_STOPWORDS = new Set(['的', '了', '和', '与', '去', '想', '要', '旅行', '旅游', 'trip']);

export function inferNarrativeIntakeFromText(text: string): NarrativeIntakeInput {
  const trimmed = text.trim();
  if (!trimmed) {
    return { motivations: ['unsure'] };
  }

  const motivations: TravelMotivation[] = [];
  for (const { motivation, patterns } of MOTIVATION_PATTERNS) {
    if (patterns.some((p) => p.test(trimmed))) {
      motivations.push(motivation);
    }
  }
  if (motivations.length === 0) {
    motivations.push('unsure');
  }

  const moodKeywords = extractMoodKeywords(trimmed);

  return {
    recentState: trimmed.length <= 200 ? trimmed : trimmed.slice(0, 200),
    motivations: [...new Set(motivations)].slice(0, 4),
    moodKeywords: moodKeywords.length > 0 ? moodKeywords : undefined,
  };
}

function extractMoodKeywords(text: string): string[] {
  const keywords: string[] = [];

  const explicit = text.match(/[「『"](.{1,6})[」』"]/g);
  if (explicit) {
    for (const m of explicit) {
      const inner = m.replace(/[「『"」』"]/g, '').trim();
      if (inner.length >= 1 && inner.length <= 6) {
        keywords.push(inner);
      }
    }
  }

  const moodTokens = ['风', '孤独', '开阔', '慢', '静', '海', '山', '雪', '光', '自由'];
  for (const token of moodTokens) {
    if (text.includes(token) && !keywords.includes(token)) {
      keywords.push(token);
    }
  }

  if (keywords.length === 0) {
    const parts = text
      .split(/[\s,，、；;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 6 && !MOOD_STOPWORDS.has(s));
    keywords.push(...parts.slice(0, 2));
  }

  return [...new Set(keywords)].slice(0, 3);
}
