/**
 * 轻量问答路径：在完整 itinerary.verify 之外的「极速安全闸」。
 * 命中 F-road/高地语义 + 2WD 意图时，复用既有仲裁 + iceland-v1 strat，仅注入 LLM prompt / safety_surface 补充，不写 WDMA（避免判定污染）。
 */
import type { Itinerary } from '../interfaces/trip-plan.interface';
import icelandV1 from '../../assets/strategy/iceland-v1.json';
import type { IcelandStrategyDocumentV1 } from '../strategy/world-strategy.types';
import {
  buildVirtualCarRentalRowsFromIntent,
  collectIcelandVehicleTerrainArbitrationIssues,
  inferCarRentalDriveFromResearchRows,
  itineraryImpliesFRoadOrHighland,
} from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import type { ItineraryVerifyOutput } from '../../skills/itinerary/itinerary-verify.skill';
import { shouldInjectIcelandRentalGuidanceForLightweight } from './orchestration-signals.util';

export type IcelandLightweightFroad2wdFastFailInput = {
  message: string;
  tripContextJoined: string;
  /** 顶层 structured_travel_input.start_date（若有） */
  structuredStartYmd?: string;
};

export type IcelandLightweightFroad2wdFastFailResult = {
  hit: boolean;
  promptLines: string[];
  stratIds: string[];
  refIds: string[];
  rawIssues: ItineraryVerifyOutput['issues'];
  durationMs: number;
};

function parseAnchoredTripStartYmd(tripContextJoined: string): string | undefined {
  const m = tripContextJoined.match(/开始日期:\s*(\d{4}-\d{2}-\d{2})/);
  return m?.[1];
}

function blobImpliesWinterScenario(blob: string): boolean {
  return /冬季|冬天|\bwinter\b|冬月|雪季|十一月|十二月|一月|二月|三月|四月|11\s*月|12\s*月|1\s*月|2\s*月|3\s*月|4\s*月/i.test(
    blob,
  );
}

function blobImpliesFroadOrHighland(blob: string): boolean {
  return (
    /\bF\s*\d{2,3}\b|f-road|F路|高地|内陆|中央高地|Landmannalaugar|Þórsmörk|Thorsmork|Askja|Kverkfjöll|Kerlingarfjöll/i.test(
      blob,
    ) || /ring-road:.*highland|highland.*corridor/i.test(blob)
  );
}

function blobImpliesTwoWdLean(blob: string): boolean {
  if (/\b4wd|四驱|四驅|4x4|全地形|越野能力|duster\s*4|defender/i.test(blob)) {
    return false;
  }
  return /2wd|两驱|前驱|经济型|小型车|雅力士|yaris|\beconomy\b|\bsedan\b|普通轿车|小轿车/i.test(blob);
}

function collectStratIdsFromIssues(issues: ItineraryVerifyOutput['issues']): { stratIds: string[]; refIds: string[] } {
  const refIds = new Set<string>();
  for (const i of issues) {
    const ids = i.violation?.evidence?.refIds;
    if (!Array.isArray(ids)) continue;
    for (const r of ids) {
      if (typeof r === 'string' && r.startsWith('strat:')) refIds.add(r);
    }
  }
  const stratIds = [...refIds].map((r) => r.replace(/^strat:/, ''));
  return { stratIds, refIds: [...refIds] };
}

/**
 * 仅在「冰岛租车轻量注入车道」且话术同时命中 F-road/高地 + 2WD 倾向时求值；否则返回 hit:false。
 */
export function evaluateIcelandLightweightFroad2wdFastFail(
  input: IcelandLightweightFroad2wdFastFailInput,
): IcelandLightweightFroad2wdFastFailResult {
  const empty: IcelandLightweightFroad2wdFastFailResult = {
    hit: false,
    promptLines: [],
    stratIds: [],
    refIds: [],
    rawIssues: [],
    durationMs: 0,
  };
  const message = String(input.message ?? '').trim();
  const tripContextJoined = String(input.tripContextJoined ?? '');
  if (!shouldInjectIcelandRentalGuidanceForLightweight(message, tripContextJoined)) {
    return empty;
  }
  const blob = `${message}\n${tripContextJoined}`;
  if (!blobImpliesFroadOrHighland(blob) || !blobImpliesTwoWdLean(blob)) {
    return empty;
  }

  const winterScenario = blobImpliesWinterScenario(blob);
  const anchored = input.structuredStartYmd?.trim() || parseAnchoredTripStartYmd(tripContextJoined);
  const anchorYmd = winterScenario ? '2026-12-15' : anchored && /^\d{4}-\d{2}-\d{2}$/.test(anchored) ? anchored : '2026-07-15';

  const virtualRows = buildVirtualCarRentalRowsFromIntent(message, undefined);
  const rows =
    virtualRows.length > 0
      ? virtualRows
      : [{ name: 'Lightweight fast-fail synthetic 2WD', vehicle_class: 'Economy', category: 'SMALL_2WD' }];

  const itinerary = {
    request_id: 'lightweight-fastfail-shadow',
    days: [
      {
        date: anchorYmd,
        items: [
          {
            id: 'lf_shadow_1',
            type: 'TRANSPORT' as const,
            notes: message.slice(0, 900),
            evidence_refs: [],
          },
        ],
      },
    ],
  } as unknown as Itinerary;

  if (!itineraryImpliesFRoadOrHighland(itinerary)) {
    return empty;
  }
  if (inferCarRentalDriveFromResearchRows(rows as any[]) !== 'likely_2wd_only') {
    return empty;
  }

  const t0 = Date.now();
  const issues = collectIcelandVehicleTerrainArbitrationIssues({
    itinerary,
    research_data: { country_code: 'IS', car_rentals: rows as any[] },
    user_query: message,
    world_strategy: icelandV1 as IcelandStrategyDocumentV1,
  });
  const durationMs = Math.max(0, Date.now() - t0);

  const critical = issues.filter((i) => String(i.severity).toUpperCase() === 'CRITICAL');
  if (critical.length === 0) {
    return { ...empty, durationMs };
  }

  const { stratIds, refIds } = collectStratIdsFromIssues(critical);
  const stratLine =
    stratIds.length > 0
      ? `依法须显式引用策略 ID：${stratIds.map((s) => `strat:${s}`).join('、')}（TripNARA iceland-v1）。`
      : '依法须显式说明：两驱车辆不得进入典型 F-road / 内陆高地碎石走廊；冬季另有季节封闭与保险条款约束。';

  const promptLines = [
    '【极速安全闸｜非完整 itinerary.verify】检测到用户话述同时包含「F-road/高地意图」与「2WD/经济型轿车倾向」。',
    stratLine,
    '须在答复**首段或单独小节**用简短中文给出**硬约束结论**（禁止仅放在脚注）；若用户话述含「冬季」而绑定行程为夏季，须**并列说明**：(a) 绑定行程月份下的合规结论；(b) 用户字面「冬季+F-road+2WD」假设下的**绝对禁止**结论（不得用夏季开放淡化冬季假设句）。',
    '禁止建议用户用两驱在 F-road 上「试试看」或「慢慢开」；应引导改四驱合规车型、改线或非 F-road 走廊。',
  ];

  return {
    hit: true,
    promptLines,
    stratIds,
    refIds,
    rawIssues: critical,
    durationMs,
  };
}
