import {
  RESEARCH_TRACE_SIGNALS_SCHEMA_V1,
  mapResearchTraceSignalsToLogMetadata,
} from './research-trace-signals-log-metadata.util';
import { EXPERIENCE_FLOW_RESEARCH_KEY, EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

describe('mapResearchTraceSignalsToLogMetadata', () => {
  it('returns empty when mirror missing or schema mismatch', () => {
    expect(mapResearchTraceSignalsToLogMetadata(undefined)).toEqual({});
    expect(mapResearchTraceSignalsToLogMetadata({})).toEqual({});
    expect(
      mapResearchTraceSignalsToLogMetadata({
        __research_trace_signals: { schemaVersion: 'other' },
      }),
    ).toEqual({});
  });

  it('maps v1 signals + audit threshold', () => {
    const meta = mapResearchTraceSignalsToLogMetadata({
      __research_trace_signals: {
        schemaVersion: RESEARCH_TRACE_SIGNALS_SCHEMA_V1,
        stability_mode_active: true,
        frustration_circuit_triggered: true,
        narrative_track: 'EMPATHY_RECOVERY',
        frustration_threshold: 0.52,
      },
    });
    expect(meta.stability_mode_active).toBe(true);
    expect(meta.frustration_circuit_triggered).toBe(true);
    expect(meta.narrative_track).toBe('EMPATHY_RECOVERY');
    expect(meta._audit_frustration_threshold).toBe(0.52);
  });

  it('maps __experience_flow snapshot into metadata', () => {
    const meta = mapResearchTraceSignalsToLogMetadata({
      __research_trace_signals: {
        schemaVersion: RESEARCH_TRACE_SIGNALS_SCHEMA_V1,
        stability_mode_active: true,
        frustration_circuit_triggered: true,
        narrative_track: 'EMPATHY_RECOVERY',
        frustration_threshold: 0.52,
      },
      [EXPERIENCE_FLOW_RESEARCH_KEY]: {
        schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
        tempo: 'EMPATHY_RECOVERY',
        heterogeneityIndex: 0.35,
        surpriseBuffer: 0.05,
        currentFrictionCapacity: 0.2,
        narrativeTone: 'empathetic_reassurance',
      },
    });
    expect(meta.experience_flow?.tempo).toBe('EMPATHY_RECOVERY');
    expect(meta.experience_flow?.narrativeTone).toBe('empathetic_reassurance');
  });
});
