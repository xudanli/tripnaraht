import fs from 'fs';
import path from 'path';
import {
  buildDsoFromE2ECase,
  buildStormStrategyRagChunks,
  enrichStormDsoForCapture,
  loadCountryRagSeedChunks,
  mergeRagMaterializationIntoHints,
} from './decision-closure-capture.util';
import { auDecisionClosureGreatOceanFireCase } from './e2e-cases/au-decision-closure-great-ocean-fire.example';
import { icelandStormIcecaveFailureCase } from './e2e-cases/iceland-storm-icecave-failure.example';
import { worldEventsFromRagChunks } from '../../../world/rag-chunks-to-world-events.util';

describe('decision-closure-capture.util', () => {
  it('enrichStormDsoForCapture injects HARD road + weather violations', () => {
    const stormPath = path.join(__dirname, 'e2e-cases/iceland-storm-icecave-failure.json');
    const storm = JSON.parse(fs.readFileSync(stormPath, 'utf8'));
    const dso = enrichStormDsoForCapture(buildDsoFromE2ECase(icelandStormIcecaveFailureCase), storm);
    const types = (dso.constraints?.violations ?? []).map((v) => v.type);
    expect(types).toContain('WORLD_ROAD_CLOSED');
    expect(types).toContain('WORLD_WEATHER_BLIZZARD');
    expect(dso.uncertaintyProfile?.entropy01).toBeGreaterThan(0.8);
  });

  it('mergeRagMaterializationIntoHints attaches roadIds from strategy chunks', () => {
    const stormPath = path.join(__dirname, 'e2e-cases/iceland-storm-icecave-failure.json');
    const storm = JSON.parse(fs.readFileSync(stormPath, 'utf8'));
    const dso = enrichStormDsoForCapture(buildDsoFromE2ECase(icelandStormIcecaveFailureCase), storm);
    const merged = mergeRagMaterializationIntoHints(
      { method: 'CGUS', metaDecisionAudit: 'META' },
      dso,
      buildStormStrategyRagChunks(storm),
    );
    expect(merged.worldConstraintMaterialization?.appliedEvents).toBeGreaterThanOrEqual(1);
    expect(merged.worldConstraintMaterialization?.roadIds).toContain('IS-R1-SOUTH');
    expect(merged.metaDecisionAudit).toContain('ragWorld=');
  });

  it('buildStormStrategyRagChunks yields IS-R1-SOUTH ROAD event', () => {
    const stormPath = path.join(__dirname, 'e2e-cases/iceland-storm-icecave-failure.json');
    const storm = JSON.parse(fs.readFileSync(stormPath, 'utf8'));
    const events = worldEventsFromRagChunks(buildStormStrategyRagChunks(storm));
    expect(events.some((e) => e.kind === 'ROAD' && e.roadId === 'IS-R1-SOUTH')).toBe(true);
  });

  it('loadCountryRagSeedChunks loads AU B100 seed', () => {
    const chunks = loadCountryRagSeedChunks('AU');
    expect(chunks.length).toBeGreaterThan(0);
    const events = worldEventsFromRagChunks(chunks, { tripDates: ['2026-01-18'] });
    expect(events.some((e) => e.kind === 'ROAD' && (e as { roadId: string }).roadId === 'B100')).toBe(true);
  });

  it('buildDsoFromE2ECase uses country destination for AU fixture', () => {
    const dso = buildDsoFromE2ECase(auDecisionClosureGreatOceanFireCase);
    expect(dso.userIntent?.destination).toBe('Australia');
    expect(dso.environmentState?.countryCode).toBe('AU');
  });
});
