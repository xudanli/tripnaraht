import {
  assertVectorMustNotHardBlock,
  VectorHardBlockViolationError,
  SEMANTIC_HARD_BLOCK_POLICY,
} from './vector-hard-block.guard.util';
import {
  embeddingStatusFromCounts,
  freshnessFromFile,
  toKnowledgeDocumentView,
} from './build-knowledge-document-view.util';
import { KnowledgeSemanticService } from './knowledge-semantic.service';
import { buildKnowledgeHealthOverview } from './build-knowledge-health-overview.util';

describe('vector-hard-block.guard', () => {
  it('allows evidence discovery role', () => {
    const r = assertVectorMustNotHardBlock({
      consumer: 'Gate',
      proposedRole: 'EVIDENCE_DISCOVERY',
    });
    expect(r.hardBlockEligible).toBe(false);
  });

  it('throws when hardBlockFromVector', () => {
    expect(() =>
      assertVectorMustNotHardBlock({
        consumer: 'Gate',
        hardBlockFromVector: true,
      }),
    ).toThrow(VectorHardBlockViolationError);
  });

  it('throws on similarity block threshold', () => {
    expect(() =>
      assertVectorMustNotHardBlock({
        consumer: 'Constraint',
        vectorSimilarityAsBlockThreshold: 0.8,
      }),
    ).toThrow(VectorHardBlockViolationError);
  });
});

describe('build-knowledge-document-view', () => {
  it('never sets hardBlockEligible', () => {
    const v = toKnowledgeDocumentView({
      id: '1',
      filename: 'x.md',
      category: 'risks',
      chunksCount: 2,
      withEmbedding: 2,
      credibilityScore: 0.9,
      lastVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      countryCode: 'IS',
      source: 'Road.is',
    });
    expect(v.hardBlockEligible).toBe(false);
    expect(v.freshness).toBe('VERIFIED');
    expect(v.embeddingStatus).toBe('INDEXED');
    expect(embeddingStatusFromCounts(0)).toBe('NONE');
    expect(freshnessFromFile({ credibilityScore: 0.2 })).toBe('STALE');
  });
});

describe('KnowledgeSemanticService', () => {
  it('lists demo docs when db offline and exposes policy', async () => {
    const svc = new KnowledgeSemanticService({
      isDbConnected: () => false,
    } as never);
    svc.onModuleInit();
    const listed = await svc.listDocuments({ countryCode: 'IS' });
    expect(listed.items.length).toBeGreaterThan(0);
    expect(listed.items.every((d) => d.hardBlockEligible === false)).toBe(true);
    expect(listed.policy).toEqual(SEMANTIC_HARD_BLOCK_POLICY);
    const traces = svc.listRetrievalTraces();
    expect(traces.items[0].hardBlockEligible).toBe(false);
  });
});

describe('buildKnowledgeHealthOverview', () => {
  it('returns phase 6 metrics + red lines', () => {
    const overview = buildKnowledgeHealthOverview({
      identity: {
        list: () => ({ total: 10 }),
        listUnresolved: () => [],
      } as never,
      worldState: {
        coverageStats: () => ({
          snapshotSsotCoverage: 1,
          staleFactRate: 0.1,
          snapshotCount: 2,
        }),
      } as never,
      relations: {
        standardizationRate: () => 1,
        stats: () => ({ relationCount: 12 }),
      } as never,
      travelerContext: {
        coverageStats: () => ({ etcConsumeCoverage: 0.5, etcConsumeMode: 'shadow' }),
      } as never,
      decisionCases: {
        coverageStats: () => ({
          decisionCaseCaptureRate: 1,
          evidenceMissingRate: 0.5,
          caseCount: 3,
        }),
      } as never,
      semantic: {
        coverageStats: () => ({
          semanticProxyReady: true,
          retrievalTraceCount: 1,
          vectorHardBlockBanned: true,
        }),
      } as never,
    });
    expect(overview.phase).toBe(6);
    expect(overview.metrics.vectorHardBlockBanned).toBe(true);
    expect(overview.redLines.vectorMustNotHardBlock).toBe(true);
    expect(overview.runtimeConvergence.wired.ontologyStaleFactFilter).toBe(true);
    expect(overview.countsForOps.decisionCaseCount).toBe(3);
  });
});
