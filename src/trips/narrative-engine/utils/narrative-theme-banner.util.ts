/**
 * Trip 详情页叙事主题 Banner — 从 metadata 构建前端展示块
 */

import type { TripNarrativeThemeMetadata } from '../types/travel-storyform.types';
import type { NarrativeArcTemplate } from '../types/narrative-arc.types';

export interface NarrativeThemeBanner {
  visible: boolean;
  title: string;
  tagline: string;
  arcTemplate: NarrativeArcTemplate;
  arcLabel: string;
  reflectionMode: string;
  selectedAt: string;
  resonanceHint?: string;
}

const ARC_LABELS: Record<NarrativeArcTemplate, string> = {
  exploration: '探索',
  healing: '疗愈',
  connection: '连接',
  neutral: '开放旅程',
};

export function readTripNarrativeThemeMetadata(
  metadata: unknown,
): TripNarrativeThemeMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const theme = (metadata as Record<string, unknown>).narrativeTheme;
  if (!theme || typeof theme !== 'object') {
    return null;
  }
  const t = theme as TripNarrativeThemeMetadata;
  if (t.schemaVersion !== 1 || !t.title) {
    return null;
  }
  return t;
}

export function buildNarrativeThemeBanner(
  metadata: unknown,
): NarrativeThemeBanner | null {
  const theme = readTripNarrativeThemeMetadata(metadata);
  if (!theme) {
    return null;
  }

  return {
    visible: true,
    title: theme.title,
    tagline: theme.tagline,
    arcTemplate: theme.arcTemplate,
    arcLabel: ARC_LABELS[theme.arcTemplate] ?? theme.arcTemplate,
    reflectionMode: theme.reflectionMode,
    selectedAt: theme.selectedAt,
  };
}

export function isNarrativeThemeBannerEnabled(): boolean {
  return process.env.NARRATIVE_THEME_V1 === 'true';
}
