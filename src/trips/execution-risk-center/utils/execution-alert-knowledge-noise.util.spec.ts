import type { ActiveRisk } from '../types/execution-risk.types';
import {
  filterKnowledgeNoiseForExecutionAlerts,
  isKnowledgePackageNoiseRisk,
  shouldExcludeRiskFromPrimaryImpacts,
} from './execution-alert-knowledge-noise.util';
import { buildHarnessActiveRisks } from '../harness/execution-risk-p0.harness.util';

describe('execution-alert-knowledge-noise.util', () => {
  const volcanoRisk = {
    id: 'risk_volc',
    title: 'Volcanic ash warning',
    summary: 'Airspace closure due to volcanic ash cloud',
    knowledgeCode: 'ENV-VOLC-01',
    generationMode: 'CAUSAL_DERIVATION',
    type: 'ENVIRONMENT',
    code: 'WEATHER_SEVERE',
  } as ActiveRisk;

  it('detects knowledge package noise', () => {
    expect(isKnowledgePackageNoiseRisk(volcanoRisk)).toBe(true);
  });

  it('excludes volcano derivations from weather primary impacts', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    expect(shouldExcludeRiskFromPrimaryImpacts(volcanoRisk, primary)).toBe(true);
  });

  it('filters noise risks when weather primary exists', () => {
    const primary = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;
    const scheduleStop = {
      ...primary,
      id: 'risk_night',
      type: 'SCHEDULE' as const,
      code: 'GENERIC' as const,
      title: '不夜驾',
      executionGate: 'STOP' as const,
    };
    const filtered = filterKnowledgeNoiseForExecutionAlerts(
      [scheduleStop, primary, volcanoRisk],
      primary,
    );
    expect(filtered.map((r) => r.id)).toEqual([scheduleStop.id, primary.id]);
  });
});
