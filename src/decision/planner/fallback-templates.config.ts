import * as fs from 'fs';
import * as path from 'path';

export type FallbackStrategy = 'CITY_WALK' | 'CLASSIC' | 'HOT_SPOTS' | 'BALANCED';

export interface FallbackTemplateConfig {
  name: string;
  exploreAction: string;
  poiAction: string;
  nightAction: string;
}

export const DEFAULT_TEMPLATE_CONFIG: Record<FallbackStrategy, FallbackTemplateConfig> = {
  CITY_WALK: {
    name: 'City Walk',
    exploreAction: '步行探索核心街区',
    poiAction: '选择一个地标景点参观',
    nightAction: '晚餐 + 夜景',
  },
  CLASSIC: {
    name: 'Classic',
    exploreAction: '经典景点串联参观',
    poiAction: '优先安排城市代表性地标',
    nightAction: '晚餐 + 经典夜景路线',
  },
  HOT_SPOTS: {
    name: 'Hot Spots',
    exploreAction: '热门打卡点快速巡游',
    poiAction: '优先安排社交平台高热度景点',
    nightAction: '晚餐 + 热门商圈夜生活',
  },
  BALANCED: {
    name: 'Balanced',
    exploreAction: '均衡游览（地标+街区+休息）',
    poiAction: '安排一个地标与一个轻松体验点',
    nightAction: '晚餐 + 自由活动',
  },
};

// 内置兜底城市覆写（JSON 读取失败时使用）
export const BUILTIN_CITY_TEMPLATE_OVERRIDES: Record<
  string,
  Partial<Record<FallbackStrategy, Partial<FallbackTemplateConfig>>>
> = {
  tokyo: {
    CITY_WALK: { exploreAction: '步行探索东京核心街区（银座/浅草）' },
    CLASSIC: { poiAction: '优先安排东京塔/浅草寺等代表性地标' },
  },
  东京: {
    CITY_WALK: { exploreAction: '步行探索东京核心街区（银座/浅草）' },
    CLASSIC: { poiAction: '优先安排东京塔/浅草寺等代表性地标' },
  },
};

interface DynamicTemplatePayload {
  version?: string;
  scheduling?: {
    conservative_threshold?: number;
    buffer_minutes?: number;
  };
  cityOverrides?: Record<string, Partial<Record<FallbackStrategy, Partial<FallbackTemplateConfig>>>>;
}

let cachedMtimeMs = -1;
let cachedVersion = 'builtin-v1';
let cachedOverrides = BUILTIN_CITY_TEMPLATE_OVERRIDES;
let cachedConservativeThreshold = 0.7;
let cachedBufferMinutes = 90;

function getTemplateJsonPath(): string {
  const candidates = [
    path.join(process.cwd(), 'src/decision/planner/fallback-templates.json'),
    path.join(process.cwd(), 'dist/src/decision/planner/fallback-templates.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function isValidOverrides(
  input: unknown,
): input is Record<string, Partial<Record<FallbackStrategy, Partial<FallbackTemplateConfig>>>> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

export function getDynamicCityTemplateOverrides(): {
  version: string;
  conservativeThreshold: number;
  bufferMinutes: number;
  overrides: Record<string, Partial<Record<FallbackStrategy, Partial<FallbackTemplateConfig>>>>;
} {
  try {
    const filePath = getTemplateJsonPath();
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs === cachedMtimeMs) {
      return {
        version: cachedVersion,
        conservativeThreshold: cachedConservativeThreshold,
        bufferMinutes: cachedBufferMinutes,
        overrides: cachedOverrides,
      };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as DynamicTemplatePayload;
    cachedMtimeMs = stat.mtimeMs;
    cachedVersion = typeof parsed.version === 'string' ? parsed.version : 'json-unknown';
    cachedConservativeThreshold =
      typeof parsed.scheduling?.conservative_threshold === 'number'
        ? parsed.scheduling.conservative_threshold
        : 0.7;
    cachedBufferMinutes =
      typeof parsed.scheduling?.buffer_minutes === 'number'
        ? Math.max(15, Math.min(180, parsed.scheduling.buffer_minutes))
        : 90;
    cachedOverrides = isValidOverrides(parsed.cityOverrides)
      ? parsed.cityOverrides
      : BUILTIN_CITY_TEMPLATE_OVERRIDES;
    return {
      version: cachedVersion,
      conservativeThreshold: cachedConservativeThreshold,
      bufferMinutes: cachedBufferMinutes,
      overrides: cachedOverrides,
    };
  } catch {
    return {
      version: 'builtin-v1',
      conservativeThreshold: 0.7,
      bufferMinutes: 90,
      overrides: BUILTIN_CITY_TEMPLATE_OVERRIDES,
    };
  }
}
