/**
 * 极光槽位选日 INTAKE RAG 补充（从 ClaudeOrchestrator 迁出）。
 */

import type { AuroraSlotPlacementRagHost } from './aurora-slot-placement-rag.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { ChunkRetrievalParams } from '../../rag/services/chunk-retrieval.service';
import {
  getBoundDecisionContext,
  runWithDecisionContextAsync,
} from '../../trips/reality-kernel/reality-context.storage';
import { isRagRealityPolicyGateActive } from '../../rag/reality-policy/rag-reality-policy.env';
import { ragRetrievalExpansionParams } from '../utils/query-rewrite-rag-expansion.util';
import {
  AURORA_SLOT_RAG_POIS_QUERY,
  AURORA_SLOT_RAG_PRACTICAL_QUERY,
  buildAuroraSlotPlacementRagSection,
  mapChunkToAuroraSlotRagEntry,
} from '../utils/aurora-slot-placement-rag.util';

export type AuroraSlotPlacementRagSupplement = {
  supplementZh: string | null;
  citationCount: number;
  relevantCount: number;
  usedStaticFallback: boolean;
};

export async function retrieveAuroraSlotPlacementRagSupplement(
  host: AuroraSlotPlacementRagHost,
  message: string,
): Promise<AuroraSlotPlacementRagSupplement> {
  const empty: AuroraSlotPlacementRagSupplement = {
    supplementZh: null,
    citationCount: 0,
    relevantCount: 0,
    usedStaticFallback: false,
  };
  if (!host.chunkRetrieval) {
    host.logger.debug('[INTAKE] Aurora slot RAG skipped: ChunkRetrieval not injected');
    return empty;
  }
  const decisionContext = getBoundDecisionContext();
  const { scope, policy } = host.ragRealityPolicyGate.resolve(decisionContext);
  if (scope === 'blocked') {
    const codes = policy.codes?.length ? policy.codes.join(',') : 'n/a';
    host.logger.debug(`[INTAKE] Aurora slot RAG skipped: rag_soft_world_blocked codes=${codes}`);
    return empty;
  }
  const mergeRagParams = (p: ChunkRetrievalParams): ChunkRetrievalParams =>
    host.ragRealityPolicyGate.mergeChunkRetrievalParams(
      { ...ragRetrievalExpansionParams(), ...p },
      scope,
    );
  const userCtx = String(message ?? '').trim();
  const poisQuery = userCtx
    ? `${AURORA_SLOT_RAG_POIS_QUERY} ${userCtx}`.slice(0, 512)
    : AURORA_SLOT_RAG_POIS_QUERY;
  try {
    const [poisPool, practicalPool] = await Promise.all([
      host.chunkRetrieval.retrieve(
        mergeRagParams({
          query: poisQuery,
          limit: 10,
          category: 'pois',
          useHybridSearch: true,
          credibilityMin: 0.35,
        }),
      ),
      host.chunkRetrieval.retrieve(
        mergeRagParams({
          query: AURORA_SLOT_RAG_PRACTICAL_QUERY,
          limit: 8,
          category: 'practical',
          useHybridSearch: true,
          credibilityMin: 0.35,
        }),
      ),
    ]);
    const pois = (poisPool ?? []).map((r) =>
      mapChunkToAuroraSlotRagEntry(String(r.content), host.formatRagDocumentTitle(r)),
    );
    const practical = (practicalPool ?? []).map((r) =>
      mapChunkToAuroraSlotRagEntry(String(r.content), host.formatRagDocumentTitle(r)),
    );
    const ragSection = buildAuroraSlotPlacementRagSection(pois, practical);
    const citationCount = (poisPool?.length ?? 0) + (practicalPool?.length ?? 0);
    if (ragSection.supplementZh) {
      host.logger.debug(
        `[INTAKE] Aurora slot RAG attached raw=${citationCount} relevant=${ragSection.relevantCount} static=${ragSection.usedStaticFallback} msg=${userCtx.slice(0, 48)}`,
      );
    }
    return {
      supplementZh: ragSection.supplementZh,
      citationCount,
      relevantCount: ragSection.relevantCount,
      usedStaticFallback: ragSection.usedStaticFallback,
    };
  } catch (e: unknown) {
    host.logger.warn(
      `[INTAKE] Aurora slot RAG failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return empty;
  }
}

/**
 * 极光槽位选日 INTAKE 澄清卡：拉取 pois/practical 知识库摘录（不走 DATA_LOOKUP 轻量路径）。
 * `route_and_run` 主链默认无 TLS DecisionContext；Policy 开启时需与轻量咨询一致临时 bind。
 */
export async function fetchAuroraSlotPlacementRagSupplement(
  host: AuroraSlotPlacementRagHost,
  message: string,
  opts?: { request?: RouteAndRunRequestDto; tripId?: string },
): Promise<AuroraSlotPlacementRagSupplement> {
  const runRetrieval = () => retrieveAuroraSlotPlacementRagSupplement(host, message);

  if (!isRagRealityPolicyGateActive()) {
    return runRetrieval();
  }
  if (getBoundDecisionContext()) {
    return runRetrieval();
  }
  const req = opts?.request;
  if (req) {
    const effectiveTripId = opts?.tripId?.trim() || req.trip_id?.trim() || undefined;
    const decisionCtx = await host.buildLightweightDecisionContextForRealityGate(
      req,
      effectiveTripId,
    );
    return runWithDecisionContextAsync(decisionCtx, runRetrieval);
  }
  return runRetrieval();
}
