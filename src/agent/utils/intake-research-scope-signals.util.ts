/**
 * INTAKE / NLU → ResearchAssetScope（Signal Extractor）
 *
 * - `mapModificationTargetsToScopes`：Tripnara NLU 标签 → Scope **静态注册表**（确定性契约基准）；
 * - `expandResearchInvalidateScopesWithHeuristics`：复合联动（酒店↔接驳、REMOVAL↔全域等）；
 * - `extractNluResearchInvalidateScopes`：门控 + 映射 + 联动 + dedupe。
 *
 * 编排层合并顺序：`options.research_invalidate_scopes` 先于 NLU（见 claude-orchestrator）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  dedupeResearchScopes,
  isResearchAssetScope,
  type ResearchAssetScope,
} from './research-asset-scope.util';

/** 时间轴类标签：通常导致全研究域失效（与产品「改期 = 全局重算」一致） */
const NLU_FULL_RESET_TARGETS = new Set(['time_range', 'schedule_shift', 'dates']);

/** Tripnara NLU `modification_targets` → ResearchAssetScope（单一真源，Trace 可引用键名） */
export const NLU_MODIFICATION_TARGET_TO_SCOPE: Readonly<Record<string, ResearchAssetScope>> = {
  accommodation: 'hotel',
  hotel: 'hotel',
  stay: 'hotel',
  lodging: 'hotel',
  flight: 'flight',
  airline: 'flight',
  aviation: 'flight',
  air_ticket: 'flight',
  attraction: 'destination',
  poi: 'destination',
  sightseeing: 'destination',
  activity: 'destination',
  transport: 'transport',
  car_rental: 'transport',
  transfer: 'transport',
  shuttle: 'transport',
  /** 人数 / 成团：主域 hotel；flight/transport/compliance 由 expand 联动（与 3.0 并发刷新一致） */
  party: 'hotel',
  headcount: 'hotel',
  guests: 'hotel',
  occupancy: 'hotel',
  group_size: 'hotel',
  passengers: 'flight',
  passenger_count: 'flight',
  visa: 'compliance',
  policy: 'compliance',
  entry_requirement: 'compliance',
  /** 餐饮类：归入 destination，避免与 hotel 住宿域混淆（减少「换餐馆误伤酒店」） */
  restaurant: 'destination',
  dining: 'destination',
  meal: 'destination',
};

const ALL_RESEARCH_SCOPES_EX_COMMON: readonly ResearchAssetScope[] = [
  'hotel',
  'flight',
  'destination',
  'transport',
  'compliance',
];

/** NLU `modification_targets` 中显式「人数」语义（命中则联动多域失效） */
const NLU_PARTY_MODIFICATION_TARGETS = new Set([
  'party',
  'headcount',
  'guests',
  'occupancy',
  'group_size',
  'passengers',
  'passenger_count',
]);

/** 人数变动消息启发式（与 NLU 标签互补；避免无 scope 时误扩） */
const PARTY_CHANGE_MESSAGE_RE =
  /(改人数|调整人数|更新人数|人数变更|加减人|几位出行|几个人去|大人.*小孩|儿童人数|婴儿(票|座|座椅)?|加人|减人|headcount|party\s*size|group\s*size|# of guests|\bnum(ber)?\s+of\s+guests\b)/i;

const PARTY_CHANGE_MESSAGE_CONTEXT_RE =
  /(改成|调整为|改为|调到|更新为).{0,24}(人数|位|人|guests|passengers)/i;

function listRawModificationTargetsLower(request: RouteAndRunRequestDto): string[] {
  return (request.options?.intent_flags?.modification_targets ?? []).map((x) =>
    String(x ?? '')
      .trim()
      .toLowerCase(),
  );
}

function mapSingleTargetToScope(normalizedTag: string): ResearchAssetScope | undefined {
  const t = normalizedTag.trim().toLowerCase();
  if (!t) return undefined;
  if (NLU_FULL_RESET_TARGETS.has(t)) return undefined;
  if (isResearchAssetScope(t)) return t;
  const direct = NLU_MODIFICATION_TARGET_TO_SCOPE[t];
  if (direct) return direct;
  return legacyHeuristicFallback(t);
}

/** 注册表未覆盖时的窄启发式（尽量少用，便于灰度收敛到表驱动） */
function legacyHeuristicFallback(t: string): ResearchAssetScope | undefined {
  if (/^(room|rooms)$/.test(t) || t.includes('住宿')) return 'hotel';
  if (t.includes('人数') || t.includes('成团') || t.includes('headcount') || t.includes('party_size')) return 'hotel';
  if (t.includes('航班') || t.includes('机票')) return 'flight';
  if (t.includes('景点') || t.includes('行程点')) return 'destination';
  if (t.includes('交通') || t.includes('租车')) return 'transport';
  if (t.includes('签证') || t.includes('入境')) return 'compliance';
  return undefined;
}

/**
 * NLU `modification_targets` → `ResearchAssetScope[]`（静态表优先；命中 FULL_RESET 标签则返回全域）。
 */
export function mapModificationTargetsToScopes(targets: string[]): ResearchAssetScope[] {
  const out: ResearchAssetScope[] = [];
  for (const raw of targets) {
    const rawKey = String(raw ?? '').trim();
    if (!rawKey) continue;
    const t = rawKey.toLowerCase();
    if (NLU_FULL_RESET_TARGETS.has(t)) {
      return [...ALL_RESEARCH_SCOPES_EX_COMMON];
    }
    const mapped = mapSingleTargetToScope(t);
    if (mapped) out.push(mapped);
  }
  return dedupeResearchScopes(out);
}

/**
 * 复合联动：防止孤立更新导致行程逻辑断裂（v1 启发式，可随结构化 itinerary 信号增强）。
 */
export function expandResearchInvalidateScopesWithHeuristics(
  request: RouteAndRunRequestDto,
  scopes: ResearchAssetScope[],
): ResearchAssetScope[] {
  const out = dedupeResearchScopes([...scopes]);
  const msg = String(request.message ?? '').toLowerCase();

  if (out.includes('hotel')) {
    const hintsPrivateTransfer =
      /private_transfer|私家|专车接送|点对点接送|door-to-door|chauffeur|limousine/.test(msg) ||
      /\btransfer\b.*\b(hotel|pickup)\b/.test(msg);
    if (hintsPrivateTransfer && !out.includes('transport')) {
      out.push('transport');
    }
  }

  const ref = request.options?.refinement_signal?.type;
  const rawTargets = listRawModificationTargetsLower(request);
  const partyFromNlu = rawTargets.some((t) => NLU_PARTY_MODIFICATION_TARGETS.has(t));
  const partyFromMessage =
    out.length > 0 && (PARTY_CHANGE_MESSAGE_RE.test(msg) || PARTY_CHANGE_MESSAGE_CONTEXT_RE.test(msg));
  if ((partyFromNlu || partyFromMessage) && out.length > 0) {
    const partyBundle: ResearchAssetScope[] = ['hotel', 'flight', 'transport', 'compliance'];
    for (const s of partyBundle) {
      if (!out.includes(s)) out.push(s);
    }
  }

  const destinationRemovalSignal =
    ref === 'REMOVAL' &&
    (out.includes('destination') ||
      rawTargets.some((t) =>
        ['attraction', 'poi', 'sightseeing', 'activity', 'destination', 'city', 'segment'].includes(t),
      ));

  if (destinationRemovalSignal) {
    for (const s of ALL_RESEARCH_SCOPES_EX_COMMON) {
      if (!out.includes(s)) out.push(s);
    }
  }

  return dedupeResearchScopes(out);
}

/**
 * 从 route_and_run 请求提取 NLU 驱动的研究失效作用域（不含 options.research_invalidate_scopes）。
 */
export function extractNluResearchInvalidateScopes(request: RouteAndRunRequestDto): ResearchAssetScope[] {
  const opt = request.options;
  if (!opt) return [];
  const isReplan = opt.itinerary_context?.is_replan === true;
  const ref = opt.refinement_signal?.type;
  const gatedByRefinement = ref === 'REPLACEMENT' || ref === 'REMOVAL' || ref === 'ADDITION';
  if (!isReplan && !gatedByRefinement) return [];
  const targets = opt.intent_flags?.modification_targets;
  if (!Array.isArray(targets) || targets.length === 0) return [];
  const mapped = mapModificationTargetsToScopes(targets.map((x) => String(x)));
  return expandResearchInvalidateScopesWithHeuristics(request, mapped);
}

/** 导出注册表键集合（测试 / 文档生成） */
export function listRegisteredNluModificationTargets(): string[] {
  return Object.keys(NLU_MODIFICATION_TARGET_TO_SCOPE).sort();
}
