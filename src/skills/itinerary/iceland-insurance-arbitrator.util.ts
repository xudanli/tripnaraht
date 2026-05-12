/**
 * itinerary.verify：冰岛「保险策略」最小仲裁（Insurance Policy Arbitrator）
 *
 * 仅产出建议性 WARNING/INFO；不阻断 verified。依赖租车 MCP 行 + `iceland_rental_guidance` + 可选 `user_query` 文本启发式。
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { ItineraryVerifyOutput } from './itinerary-verify.skill';
import { CONSTRAINT_IDS } from '../../agent/services/constraint-registry';
import {
  ICELAND_INSURANCE_LEXICON,
  insuranceLexiconMatchAny,
} from './iceland-insurance-lexicon';
import { isIcelandContextForArbitration } from './iceland-vehicle-terrain-arbitrator.util';

function extractCarRentalRows(researchData: Record<string, unknown> | undefined): unknown[] {
  if (!researchData) return [];
  const raw = researchData.car_rentals ?? researchData.carRentals;
  if (Array.isArray(raw)) return raw;
  const nested = (raw as { data?: unknown[] })?.data;
  return Array.isArray(nested) ? nested : [];
}

function itineraryBlob(itinerary: Itinerary): string {
  const parts: string[] = [];
  for (const d of itinerary.days ?? []) {
    for (const it of d.items ?? []) {
      const meta = (it as { metadata?: { route_segment_ref?: string } }).metadata;
      parts.push(
        [
          it.type,
          it.notes,
          it.location_ref?.name,
          (it.location_ref as { place_id?: string } | undefined)?.place_id,
          meta?.route_segment_ref,
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
  }
  return parts.join('\n').toLowerCase();
}

function insuranceEvidenceBlob(research_data?: Record<string, unknown>, user_query?: string): string {
  const rows = extractCarRentalRows(research_data);
  const chunks: string[] = [];
  for (const r of rows) {
    chunks.push(JSON.stringify(r ?? '').toLowerCase());
  }
  const g = research_data?.iceland_rental_guidance;
  if (g && typeof g === 'object') {
    chunks.push(JSON.stringify(g).toLowerCase());
  }
  if (user_query?.trim()) {
    chunks.push(user_query.trim().toLowerCase());
  }
  return chunks.join('\n');
}

function hasZeroExcessTier(blob: string): boolean {
  return insuranceLexiconMatchAny(blob, ICELAND_INSURANCE_LEXICON.ZERO_EXCESS);
}

/** 全险档视为已含 GP；否则看显式碎石险关键词 */
function hasGravelProtection(blob: string, zero: boolean): boolean {
  return zero || insuranceLexiconMatchAny(blob, ICELAND_INSURANCE_LEXICON.GRAVEL);
}

function hasSandAshProtection(blob: string, zero: boolean): boolean {
  return zero || insuranceLexiconMatchAny(blob, ICELAND_INSURANCE_LEXICON.SAND_ASH);
}

function hasBasicOrHighExcess(blob: string): boolean {
  return insuranceLexiconMatchAny(blob, ICELAND_INSURANCE_LEXICON.BASIC_OR_HIGH_EXCESS);
}

/** 东部峡湾 / 碎石暴露启发式 */
function itineraryImpliesGravelExposure(itinerary: Itinerary): boolean {
  const b = itineraryBlob(itinerary);
  if (
    /ring-road:.*east|east-fjords|eastfjords|egilsstadir|egilsstaðir|seyðisfjörður|seyðisfjordur|breiðdalsvik|hofn|höfn|eastern\s*fjord|东部峡湾|碎石|砂石|gravel|unpaved|secondary\s*road|\bf-road\b/i.test(
      b,
    )
  ) {
    return true;
  }
  return false;
}

/** 南岸 / Vik 沙尘高发带 */
function itineraryImpliesSouthCoastDustZone(itinerary: Itinerary): boolean {
  const b = itineraryBlob(itinerary);
  return /\b(vik|vík|reynisfjara|reynisfjall|skogafoss|skógafoss|south\s*coast|南岸|维克|kirkjubaejarklaustur|kirkjubæjarklaustur|myrdalsjokull|mýrdalsjökull)\b/i.test(
    b,
  );
}

function researchImpliesHighEnvironmentComplexity(research_data?: Record<string, unknown>): boolean {
  const raw = research_data?.safetravel_alerts;
  const alerts: unknown[] = Array.isArray(raw) ? raw : [];
  if (alerts.length >= 2) return true;
  for (const x of alerts) {
    if (!x || typeof x !== 'object') continue;
    const a = x as Record<string, unknown>;
    const t = `${a.title ?? ''} ${a.summary ?? ''}`.toLowerCase();
    if (/high|critical|severe|橙色|红色|暴风|大风|封路/i.test(String(a.severity ?? '')) || /wind|storm|gale|风|封路/i.test(t)) {
      return true;
    }
  }
  return false;
}

/**
 * 产出保险建议 issues（并入 itinerary.verify；无 item_id，不打 item 风险标签）。
 */
export function collectIcelandInsurancePolicyIssues(params: {
  itinerary: Itinerary;
  research_data?: Record<string, any>;
  /** 并入保险词表匹配（影子意图 / 用户自述条款） */
  user_query?: string;
}): ItineraryVerifyOutput['issues'] {
  const { itinerary, research_data, user_query } = params;
  const issues: ItineraryVerifyOutput['issues'] = [];
  if (!isIcelandContextForArbitration(research_data)) return issues;

  const blob = insuranceEvidenceBlob(research_data, user_query);
  if (!blob.trim()) return issues;

  const zero = hasZeroExcessTier(blob);
  const gp = hasGravelProtection(blob, zero);
  const saap = hasSandAshProtection(blob, zero);
  const basicExcess = hasBasicOrHighExcess(blob);
  const gravelTrip = itineraryImpliesGravelExposure(itinerary);
  const dustTrip = itineraryImpliesSouthCoastDustZone(itinerary);
  const envHard = researchImpliesHighEnvironmentComplexity(research_data);

  if (gravelTrip && !gp) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'WARNING',
      message:
        '【保险仲裁·碎石险】行程含东部峡湾/碎石或二级非铺装暴露特征，但当前租车摘录未见 GP（Gravel Protection）或同级碎石险；全险/零免赔若已含可忽略。',
      suggestion:
        '核对订单是否含 Gravel / Stone-chip；东部与支路碎石弹坑易伤漆面和底盘。Blue（Liability Release）、Lotus（Platinum/Gold）、Zero（All-Inclusive）、Lava（Full Protection）等表述常已含或接近全险。',
      violation: {
        anchor: {
          constraintId: CONSTRAINT_IDS.INSURANCE_RENTAL_GRAVEL_PROTECTION,
          ruleId: 'itinerary.verify:iceland_insurance_v1:gravel_protection_gap',
        },
        entityRef: { type: 'OTHER', id: 'iceland_insurance_arbitrator' },
        evidence: { source: 'MODEL', refIds: ['car_rentals', 'iceland_rental_guidance', 'user_query'] },
        scope: 'GLOBAL',
      },
    });
  }

  if (dustTrip && !saap) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'INFO',
      message:
        '【保险仲裁·沙尘/火山灰】行程含南岸/Vík 一带暴露，摘录未见 SAAP（Sand & Ash）或等价条款；火山灰与横风沙尘易损车漆。',
      suggestion: '若走 Reynisfjara、开阔黑沙滩路段，向车行确认 SAAP 或全险是否覆盖沙尘/灰损。',
      violation: {
        anchor: {
          constraintId: CONSTRAINT_IDS.INSURANCE_RENTAL_SAND_ASH_PROTECTION,
          ruleId: 'itinerary.verify:iceland_insurance_v1:saap_gap',
        },
        entityRef: { type: 'OTHER', id: 'iceland_insurance_arbitrator' },
        evidence: { source: 'MODEL', refIds: ['car_rentals', 'itinerary_text', 'user_query'] },
        scope: 'GLOBAL',
      },
    });
  }

  if (envHard && basicExcess && !zero) {
    issues.push({
      type: 'REACHABILITY_ISSUE',
      severity: 'INFO',
      message:
        '【保险仲裁·自付额】当前摘录偏「基础险/高免赔」，且 SafeTravel/风况信号偏多：冰岛索赔成本与天气波动高，建议评估升级至零免赔或 Premium 包。',
      suggestion: '对比 Zero / Lotus Platinum / Blue Liability Release / Lava Full Protection 等与 Booking 行内 insurance 字段。',
      violation: {
        anchor: {
          constraintId: CONSTRAINT_IDS.INSURANCE_RENTAL_EXCESS_TIER,
          ruleId: 'itinerary.verify:iceland_insurance_v1:high_excess_warning',
        },
        entityRef: { type: 'OTHER', id: 'iceland_insurance_arbitrator' },
        evidence: { source: 'WEATHER', refIds: ['car_rentals', 'safetravel_alerts'] },
        scope: 'GLOBAL',
      },
    });
  }

  return issues;
}
