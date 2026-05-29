/**
 * P0：冰岛决策闭环 golden + explain 投影 + RAG metadata 契约样例。
 */
import * as fs from 'fs';
import * as path from 'path';
import { worldEventsFromRagChunks } from '../../../world/rag-chunks-to-world-events.util';
import type { ChunkRetrievalResult } from '../../../rag/services/chunk-retrieval.service';
import {
  assertDecisionClosureHints,
  loadDecisionClosureGolden,
  projectDecisionClosureExplain,
} from './decision-closure-assertions';
import { ICELAND_DECISION_CLOSURE_FIXTURES } from './e2e-cases/registry';
import { icelandDecisionClosureStormF208Case } from './e2e-cases/iceland-decision-closure-storm-f208.example';
import { runDecisionClosureGate } from '../../../../scripts/lib/decision-closure-gate';

describe('Iceland decision closure v1 (P0)', () => {
  it('storm F208 golden satisfies decisionClosure expected', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    expect(hints).toBeDefined();
    const exp = icelandDecisionClosureStormF208Case.expected.scientificExpected!.decisionClosure!;
    const { passed, diff } = assertDecisionClosureHints(hints!, exp);
    expect(diff).toEqual([]);
    expect(passed).toBe(true);
  });

  it('projects explain.optimization snake_case from golden hints', () => {
    const hints = loadDecisionClosureGolden(icelandDecisionClosureStormF208Case.metadata ?? {});
    const explain = projectDecisionClosureExplain(hints!);
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('repair-spatial-poi-v2');
    expect(explain?.decision_verdict?.rejected_plans?.length).toBeGreaterThanOrEqual(1);
    expect(explain?.world_constraint_materialization?.applied_events).toBe(2);
    expect(explain?.world_constraint_materialization?.road_ids).toContain('F208');
    expect(explain?.decision_verdict_narration_zh).toMatch(/推荐方案/);
  });

  it('RAG chunk with roadId + F208 metadata materializes CLOSED road event', () => {
    const chunk: ChunkRetrievalResult = {
      id: 'chunk-f208-1',
      chunkId: 'chunk-f208-1',
      category: 'ROAD_STATUS',
      content: 'F208 highland road closed due to blizzard.',
      score: 0.9,
      metadata: {
        roadId: 'F208',
        countryCode: 'IS',
        status: 'CLOSED',
        affected_slot_ids: ['day2-drive-f208'],
        structured_data: { f_road_required: { roads: ['F208'] } },
      },
    } as ChunkRetrievalResult;
    const events = worldEventsFromRagChunks([chunk]);
    expect(events.some((e) => e.kind === 'ROAD' && e.roadId === 'F208')).toBe(true);
  });

  it('decision-closure gate passes all registered P0 fixtures', () => {
    const gate = runDecisionClosureGate(ICELAND_DECISION_CLOSURE_FIXTURES);
    expect(ICELAND_DECISION_CLOSURE_FIXTURES.length).toBeGreaterThanOrEqual(2);
    expect(gate.failed).toBe(0);
    expect(gate.passed).toBe(ICELAND_DECISION_CLOSURE_FIXTURES.length);
  });

  it('rag chunk metadata schema file is valid JSON', () => {
    const schemaPath = path.join(
      process.cwd(),
      'docs/schemas/rag-chunk-road-constraint-metadata.schema.json',
    );
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    expect(schema.required).toContain('category');
    expect(schema.properties.roadId).toBeDefined();
  });
});
