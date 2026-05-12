import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import {
  buildRouteAndRunPersistReasonCodes,
  buildRouteAndRunTripsPersistMetadata,
  resolveTripsStageForRouteAndRunPersist,
  resolveTripsStageFromOrchestrationStep,
} from './route-and-run-decision-persist.util';

describe('route-and-run-decision-persist.util', () => {
  const minimalEntry = (over: Partial<DecisionLogEntry>): DecisionLogEntry =>
    ({
      request_id: 'r1',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: '',
      outputs_summary: '',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      ...over,
    }) as DecisionLogEntry;

  describe('resolveTripsStageFromOrchestrationStep', () => {
    it('maps GATE_EVAL to ABU_GATE', () => {
      expect(resolveTripsStageFromOrchestrationStep('GATE_EVAL')).toBe('ABU_GATE');
    });
    it('maps INTAKE to ROUTE_PICK', () => {
      expect(resolveTripsStageFromOrchestrationStep('INTAKE')).toBe('ROUTE_PICK');
    });
  });

  describe('resolveTripsStageForRouteAndRunPersist', () => {
    it('uses READINESS when inputs_summary is readiness checklist (CN)', () => {
      expect(
        resolveTripsStageForRouteAndRunPersist(
          minimalEntry({
            inputs_summary: '准备度检查：规则 visa_entry (entry_transit)',
            step: 'GATE_EVAL',
          }),
        ),
      ).toBe('READINESS');
    });

    it('uses READINESS when inputs_summary mentions Readiness check (EN)', () => {
      expect(
        resolveTripsStageForRouteAndRunPersist(
          minimalEntry({
            inputs_summary: 'Readiness check: rule foo',
            step: 'GATE_EVAL',
          }),
        ),
      ).toBe('READINESS');
    });

    it('falls back to step mapping for non-readiness gate rows', () => {
      expect(
        resolveTripsStageForRouteAndRunPersist(
          minimalEntry({
            inputs_summary: 'gatekeeper evaluate hazards',
            step: 'GATE_EVAL',
          }),
        ),
      ).toBe('ABU_GATE');
    });
  });

  describe('buildRouteAndRunTripsPersistMetadata', () => {
    it('merges request_id, tripRunId, and plan_version for traceability aux codes', () => {
      const m = buildRouteAndRunTripsPersistMetadata(
        minimalEntry({
          request_id: 'req-abc',
          metadata: { ruleId: 'x' },
        }),
        { tripRunId: 'tr-001', planVersion: 3 },
      );
      expect(m.request_id).toBe('req-abc');
      expect(m.tripRunId).toBe('tr-001');
      expect(m.plan_version).toBe(3);
      expect((m.route_and_run as { step?: string }).step).toBe('GATE_EVAL');
    });

    it('includes plan_version 0 when provided', () => {
      const m = buildRouteAndRunTripsPersistMetadata(
        minimalEntry({ request_id: 'r' }),
        { planVersion: 0 },
      );
      expect(m.plan_version).toBe(0);
    });

    it('omits plan_version when audit planVersion is undefined', () => {
      const m = buildRouteAndRunTripsPersistMetadata(minimalEntry({ request_id: 'r' }), {
        tripRunId: 't1',
      });
      expect(m.tripRunId).toBe('t1');
      expect('plan_version' in m).toBe(false);
    });

    it('merges ontology_evidence_display_zh from decision log entry (trip UI / 依据说明)', () => {
      const zh = ['依据说明（本体 / 路况）：示例一句'];
      const m = buildRouteAndRunTripsPersistMetadata(
        minimalEntry({
          request_id: 'r',
          ontology_evidence_display_zh: zh,
        }),
      );
      expect(m.ontology_evidence_display_zh).toEqual(zh);
    });

    it('merges readiness display + technical refs from decision log entry', () => {
      const m = buildRouteAndRunTripsPersistMetadata(
        minimalEntry({
          request_id: 'r',
          readiness_evidence_display_zh: ['准备度说明'],
          readiness_technical_evidence_refs: ['readiness_pack_check:t1'],
        }),
      );
      expect(m.readiness_evidence_display_zh).toEqual(['准备度说明']);
      expect(m.readiness_technical_evidence_refs).toEqual(['readiness_pack_check:t1']);
    });
  });

  describe('buildRouteAndRunPersistReasonCodes', () => {
    it('includes step, RULE_ slug, readiness hints, and guardian', () => {
      const codes = buildRouteAndRunPersistReasonCodes(
        minimalEntry({
          step: 'GATE_EVAL',
          outputs_summary: 'BLOCK: visa',
          metadata: { ruleId: 'visa/entry', guardian: 'ABU' },
        }),
      );
      expect(codes).toContain('GATE_EVAL');
      expect(codes).toContain('RULE_visa_entry');
      expect(codes).toContain('READINESS_BLOCK');
      expect(codes).toContain('GUARDIAN_ABU');
    });
  });
});
