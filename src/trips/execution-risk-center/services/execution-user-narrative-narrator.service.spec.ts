import {
  applyOptionalNarratorEnhancement,
  ExecutionUserNarrativeNarratorService,
} from './execution-user-narrative-narrator.service';
import { RECOVERY_GRAPH_SCHEMA } from '../../tep/contracts/tep-self-drive.types';

describe('ExecutionUserNarrativeNarratorService', () => {
  it('returns null when disabled — rule narrative preserved', async () => {
    const prev = process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED;
    process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED = '0';
    const svc = new ExecutionUserNarrativeNarratorService();
    const rule = {
      whatHappened: '强风等原因导致今天的原计划无法按时完成',
      impactOnTrip: '预计到达下一活动时间可能已超过最晚入场时间',
      recommendation: '查看替代方案',
    };
    const out = await applyOptionalNarratorEnhancement(
      { tripId: 'trip-1', ruleNarrative: rule },
      svc,
    );
    expect(out).toEqual(rule);
    process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED = prev;
  });

  it('enhances recommendation from recoveryGraph when enabled without LLM', async () => {
    const prev = process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED;
    process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED = '1';
    process.env.EXECUTION_NARRATIVE_NARRATOR_LLM = '0';
    const svc = new ExecutionUserNarrativeNarratorService();
    const rule = {
      whatHappened: 'fact',
      impactOnTrip: 'impact',
      recommendation: '查看替代方案',
    };
    const out = await applyOptionalNarratorEnhancement(
      {
        tripId: 'trip-1',
        ruleNarrative: rule,
        recoveryGraph: {
          schemaId: RECOVERY_GRAPH_SCHEMA,
          removableNodes: [],
          movableNodes: [],
          replaceableNodes: [],
          protectedNodes: [],
          dependencies: [],
          fallbackOptions: [
            {
              optionId: 'opt-1',
              action: 'REPLACE',
              targetRefs: ['a'],
              description: '改走 POI C，预计仍可在 16:00 前入场',
            },
          ],
        },
      },
      svc,
    );
    expect(out.recommendation).toContain('POI C');
    process.env.EXECUTION_NARRATIVE_NARRATOR_ENABLED = prev;
  });
});
