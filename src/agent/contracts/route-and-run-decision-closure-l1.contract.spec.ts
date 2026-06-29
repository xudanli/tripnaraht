/**
 * Frontend L1：explain.optimization + 路政 Banner 显示逻辑契约。
 */
import fs from 'fs';
import path from 'path';
import { projectDecisionClosureExplain } from '../../trips/decision/evaluation/decision-closure-assertions';
import {
  hasDecisionVerdictCard,
  hasAlternativesRows,
  hasRejectedPlansRows,
  roadBannerText,
  shouldShowRoadBanner,
} from '../utils/decision-closure-l1.util';
import icelandGolden from '../../trips/decision/evaluation/e2e-cases/iceland-decision-closure-storm-f208.golden.json';

describe('route_and_run decision closure L1 contract', () => {
  const hints = icelandGolden.optimizationHints as Parameters<
    typeof projectDecisionClosureExplain
  >[0];

  it('L1 explain fields project from golden hints', () => {
    const opt = projectDecisionClosureExplain(hints);
    expect(hasDecisionVerdictCard(opt)).toBe(true);
    expect(shouldShowRoadBanner(opt?.world_constraint_materialization)).toBe(true);
    expect(roadBannerText(opt!.world_constraint_materialization!)).toContain('F208');
  });

  it('applied_events=0 suppresses road banner', () => {
    const opt = projectDecisionClosureExplain({
      method: 'CGUS',
      recommendedAlternativeId: 'base',
      worldConstraintMaterialization: {
        appliedEvents: 0,
        roadIds: [],
        weatherDates: [],
        storeVersion: 0,
      },
    });
    expect(shouldShowRoadBanner(opt?.world_constraint_materialization)).toBe(false);
  });

  it('fixture mock matches L1 consumer expectations', () => {
    const fixturePath = path.join(
      process.cwd(),
      'fixtures/agent/route-and-run-decision-closure-l1.mock.json',
    );
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
      explain?: { optimization?: Record<string, unknown> };
      observability?: Record<string, unknown>;
    };
    const opt = raw.explain?.optimization;
    expect(opt).toBeDefined();
    expect(typeof opt?.decision_verdict_narration_zh).toBe('string');
    expect(shouldShowRoadBanner(opt?.world_constraint_materialization as any)).toBe(true);
    expect(hasRejectedPlansRows(opt?.decision_verdict as any)).toBe(true);
    expect(hasAlternativesRows(opt?.alternatives as any)).toBe(true);
    expect(raw.observability?.harness_trace_export_path).toMatch(/\.json$/);
  });
});
