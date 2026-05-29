import fs from 'fs';
import path from 'path';
import {
  buildDsoFromE2ECase,
  buildStormStrategyRagChunks,
  enrichStormDsoForCapture,
  mergeRagMaterializationIntoHints,
} from './decision-closure-capture.util';
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
});
