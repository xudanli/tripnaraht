import {
  buildGuardianDecisionLogMetadata,
  buildStructuredStatusFromSlices,
  inferGuardianExpressionPhase,
  mergeGuardianMetadataIntoLog,
  presentationDisplayStyle,
  resolveAbuExistenceFromPlanState,
  resolveDreCostFromPlanState,
  toBriefLines,
} from './guardian-decision-metadata.util';
import type { GuardianPersonaPresentation } from './guardian-presentation.types';

describe('guardian-decision-metadata.util', () => {
  describe('inferGuardianExpressionPhase', () => {
    it('returns explicit phase from metadata', () => {
      expect(
        inferGuardianExpressionPhase({ metadata: { guardianExpressionPhase: 'in_trip' } }),
      ).toBe('in_trip');
    });

    it('infers in_trip from trip lifecycle', () => {
      expect(
        inferGuardianExpressionPhase({ metadata: { tripStatus: 'TRAVELING' } }),
      ).toBe('in_trip');
    });

    it('defaults to planning', () => {
      expect(inferGuardianExpressionPhase({ metadata: {} })).toBe('planning');
    });
  });

  describe('resolveAbuExistenceFromPlanState', () => {
    it('maps REJECT to BLOCK', () => {
      expect(
        resolveAbuExistenceFromPlanState({ gate: { status: 'REJECT' } } as never),
      ).toBe('BLOCK');
    });
  });

  describe('resolveDreCostFromPlanState', () => {
    it('maps fatigue score to cost status', () => {
      expect(
        resolveDreCostFromPlanState({
          pace: { fatigueScore: { paceScore: 86 } },
        } as never),
      ).toBe('OVERLOADED');
    });
  });

  describe('presentationDisplayStyle', () => {
    it('uses execution_brief for in_trip', () => {
      expect(presentationDisplayStyle('in_trip')).toBe('execution_brief');
      expect(presentationDisplayStyle('planning')).toBe('design_advisory');
    });
  });

  describe('buildStructuredStatusFromSlices', () => {
    it('maps verdicts to actions', () => {
      const status = buildStructuredStatusFromSlices({
        abuVerdict: 'REJECT',
        dreVerdict: 'ADJUST',
        neptuneVerdict: 'REPLACE',
        abuExistence: 'BLOCK',
        dreCost: 'STRETCHED',
      });
      expect(status.abu?.action).toBe('BLOCK');
      expect(status.dre?.action).toBe('ADJUST');
      expect(status.neptune?.action).toBe('REPAIR');
    });
  });

  describe('toBriefLines', () => {
    it('caps at 3 lines for in_trip banner', () => {
      const lines = toBriefLines({
        leadSpeaker: 'NEPTUNE',
        headline: 'Neptune 已准备替代方案',
        scenario: 'INTENT_REPAIR',
        supportingLines: [
          { persona: 'NEPTUNE', icon: '🦦', name: 'Neptune', role: 'repair', text: '改上午冰川' },
          { persona: 'ABU', icon: '🐻', name: 'Abu', role: 'evidence', text: '风速偏高' },
        ],
      });
      expect(lines.length).toBeLessThanOrEqual(3);
      expect(lines[0]).toContain('Neptune');
    });
  });

  describe('buildGuardianDecisionLogMetadata', () => {
    it('extracts audit fields from presentation', () => {
      const presentation = {
        expressionPhase: 'planning',
        leadSpeaker: 'ABU',
        scenario: 'SAFETY_BLOCK',
        structuredStatus: {},
        actions: { abu: 'BLOCK' },
      } as GuardianPersonaPresentation;

      const meta = buildGuardianDecisionLogMetadata({ presentation });
      expect(meta.guardianLeadSpeaker).toBe('ABU');
      expect(meta.guardianActions?.abu).toBe('BLOCK');
    });
  });

  describe('mergeGuardianMetadataIntoLog', () => {
    it('preserves existing metadata keys', () => {
      const merged = mergeGuardianMetadataIntoLog(
        { rule_id: 'wind-threshold' },
        { revalidationPass: 'POST_NEPTUNE_REPAIR' },
      );
      expect(merged.rule_id).toBe('wind-threshold');
      expect(merged.revalidationPass).toBe('POST_NEPTUNE_REPAIR');
    });
  });
});
