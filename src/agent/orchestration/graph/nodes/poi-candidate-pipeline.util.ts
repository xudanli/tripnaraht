/**
 * POI Candidate Pipeline — 命名阶段（不新增图节点；挂在 poi_selection 执行体内）。
 */

import { alignPoiWithErCatalog } from '../../../data/er-catalog-lookup.util';

export const POI_CANDIDATE_PIPELINE_VERSION = '1.0.0' as const;
export const POI_CANDIDATE_PIPELINE_SCHEMA_ID = 'tripnara.poi_candidate_pipeline@v1' as const;

export const POI_CANDIDATE_PIPELINE_STAGES = [
  'entity_align',
  'dedupe',
  'eligibility',
  'user_match',
  'route_match',
  'evidence_check',
] as const;

export type PoiCandidatePipelineStage = (typeof POI_CANDIDATE_PIPELINE_STAGES)[number];

export type PoiCandidateLike = Record<string, unknown> & {
  place_id?: string;
  id?: string;
  name?: string;
  nameCN?: string;
  address?: string;
  coordinates?: unknown;
  metadata?: { risk_level?: string };
  __entity_key?: string;
  __er_entity_id?: string;
  __er_standard_name?: string;
  __pipeline_dropped?: boolean;
};

export type PoiCandidateStageAudit = {
  stage: PoiCandidatePipelineStage;
  input_count: number;
  output_count: number;
};

export type PoiCandidatePipelineResult = {
  schemaId: typeof POI_CANDIDATE_PIPELINE_SCHEMA_ID;
  version: 1;
  pois: PoiCandidateLike[];
  stage_audit: PoiCandidateStageAudit[];
  /** catalog 命中数（entity_align） */
  er_catalog_hits?: number;
};

export function buildPoiEntityKey(poi: PoiCandidateLike): string {
  const erId = String(poi.__er_entity_id ?? '').trim().toLowerCase();
  if (erId) return `er:${erId}`;
  const id = String(poi.place_id ?? poi.id ?? '').trim().toLowerCase();
  const name = String(poi.name ?? poi.nameCN ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const address = String(poi.address ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return [id, name, address].join('|');
}

function stageDedupe(pois: PoiCandidateLike[]): PoiCandidateLike[] {
  const seen = new Set<string>();
  const out: PoiCandidateLike[] = [];
  for (const poi of pois) {
    const key = buildPoiEntityKey(poi);
    if (!key || key === '||' || seen.has(key)) continue;
    seen.add(key);
    out.push(poi);
  }
  return out;
}

function stageEntityAlign(pois: PoiCandidateLike[]): {
  pois: PoiCandidateLike[];
  catalogHits: number;
} {
  let catalogHits = 0;
  const out = pois.map((p) => {
    const aligned = alignPoiWithErCatalog(p) as PoiCandidateLike;
    if (aligned.__er_entity_id) catalogHits += 1;
    return {
      ...aligned,
      __entity_key: buildPoiEntityKey(aligned),
    };
  });
  return { pois: out, catalogHits };
}

function stageEligibility(pois: PoiCandidateLike[]): PoiCandidateLike[] {
  return pois.filter((poi) => {
    const risk = String(poi.metadata?.risk_level ?? '').toUpperCase();
    if (risk === 'HIGH') return false;
    if (!poi.name && !poi.nameCN) return false;
    return true;
  });
}

function stageUserMatch(pois: PoiCandidateLike[], rejectedIds: string[]): PoiCandidateLike[] {
  if (!rejectedIds.length) return pois;
  const reject = new Set(rejectedIds.map((x) => x.trim().toLowerCase()).filter(Boolean));
  return pois.filter((poi) => {
    const id = String(poi.place_id ?? poi.id ?? '').trim().toLowerCase();
    const name = String(poi.name ?? poi.nameCN ?? '').trim().toLowerCase();
    const er = String(poi.__er_entity_id ?? '').trim().toLowerCase();
    if (id && reject.has(id)) return false;
    if (name && reject.has(name)) return false;
    if (er && reject.has(er)) return false;
    return true;
  });
}

/** P0：有走廊约束时保留；无则透传（真实打分仍在后续 executor） */
function stageRouteMatch(
  pois: PoiCandidateLike[],
  opts?: { corridorFilter?: (poi: PoiCandidateLike) => boolean },
): PoiCandidateLike[] {
  if (!opts?.corridorFilter) return pois;
  return pois.filter((p) => opts.corridorFilter!(p));
}

function stageEvidenceCheck(pois: PoiCandidateLike[]): PoiCandidateLike[] {
  return pois.filter((poi) => {
    const hasName = !!(poi.name || poi.nameCN);
    const hasEvidence = !!(poi.address || poi.coordinates);
    return hasName && hasEvidence;
  });
}

export function runPoiCandidatePipeline(
  raw: PoiCandidateLike[],
  opts?: {
    rejectedIds?: string[];
    corridorFilter?: (poi: PoiCandidateLike) => boolean;
  },
): PoiCandidatePipelineResult {
  const stage_audit: PoiCandidateStageAudit[] = [];
  let cur = Array.isArray(raw) ? [...raw] : [];
  let er_catalog_hits = 0;

  const run = (stage: PoiCandidatePipelineStage, fn: (p: PoiCandidateLike[]) => PoiCandidateLike[]) => {
    const input_count = cur.length;
    cur = fn(cur);
    stage_audit.push({ stage, input_count, output_count: cur.length });
  };

  // entity_align 先于最终 dedupe：catalog 对齐后可合并同实体异名
  run('entity_align', (p) => {
    const r = stageEntityAlign(p);
    er_catalog_hits = r.catalogHits;
    return r.pois;
  });
  run('dedupe', stageDedupe);
  run('eligibility', stageEligibility);
  run('user_match', (p) => stageUserMatch(p, opts?.rejectedIds ?? []));
  run('route_match', (p) => stageRouteMatch(p, { corridorFilter: opts?.corridorFilter }));
  run('evidence_check', stageEvidenceCheck);

  return {
    schemaId: POI_CANDIDATE_PIPELINE_SCHEMA_ID,
    version: 1,
    pois: cur,
    stage_audit,
    er_catalog_hits,
  };
}
