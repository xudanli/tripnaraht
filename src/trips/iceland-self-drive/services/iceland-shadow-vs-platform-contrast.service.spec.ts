/**
 * Shadow vs platform contrast — golden fixtures.
 */

import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandShadowVsPlatformContrastService } from './iceland-shadow-vs-platform-contrast.service';
import {
  fixtureDriveCapBlock,
  fixtureGoldenCirclePass,
  fixtureHighlandsFroad2wdBlock,
  fixtureHighlandsRiverExecutionBlock,
} from '../fixtures/golden-contrast.fixtures';
import { verificationSnapshotToEvaluatePlan } from '../adapters/verification-snapshot-to-evaluate-plan.adapter';

function contrastSvc() {
  return new IcelandShadowVsPlatformContrastService(
    new IcelandShadowUnifiedAssessmentService(),
  );
}

describe('IcelandShadowVsPlatformContrastService', () => {
  const svc = contrastSvc();

  it('golden_circle: both allowConfirm, gateAligned, mapped drive PASS', () => {
    const { fixtureId, snapshot } = fixtureGoldenCirclePass();
    const report = svc.contrast({ snapshot, fixtureId });

    expect(report.iceland.aggregateOutcome).toBe('PASS');
    expect(report.iceland.allowConfirm).toBe(true);
    expect(report.platform.overallStatus).toBe('FEASIBLE');
    expect(report.platform.allowConfirm).toBe(true);
    expect(report.gateAligned).toBe(true);
    expect(report.mappedAligned).toBe(true);
    expect(
      report.mapped.some(
        (m) =>
          m.icelandCid === 'ICELAND_DAY_DRIVE_CAP_001' &&
          m.platformKey === 'MAX_DAILY_DRIVE' &&
          m.aligned,
      ),
    ).toBe(true);
  });

  it('highlands_froad_2wd: both block confirm; F-road/4WD mapped HARD aligned', () => {
    const { fixtureId, snapshot } = fixtureHighlandsFroad2wdBlock();
    const report = svc.contrast({ snapshot, fixtureId });

    expect(report.iceland.allowConfirm).toBe(false);
    expect(report.platform.allowConfirm).toBe(false);
    expect(report.gateAligned).toBe(true);
    expect(report.iceland.aggregateOutcome).toBe('BLOCK');
    expect(report.platform.overallStatus).toBe('INFEASIBLE');

    const froad = report.mapped.find(
      (m) => m.icelandCid === 'ICELAND_VEHICLE_FROAD_001',
    );
    const fourWd = report.mapped.find(
      (m) => m.icelandCid === 'ICELAND_VEHICLE_4WD_001',
    );
    expect(froad?.aligned).toBe(true);
    expect(froad?.icelandBand).toBe('HARD');
    expect(froad?.platformBand).toBe('HARD');
    expect(fourWd?.aligned).toBe(true);
  });

  it('highlands_river: EXECUTION_BLOCK mapped to RIVER_CROSSING_SELF_DRIVE; gateAligned', () => {
    const { fixtureId, snapshot } = fixtureHighlandsRiverExecutionBlock();
    const report = svc.contrast({ snapshot, fixtureId });

    expect(report.iceland.aggregateOutcome).toBe('EXECUTION_BLOCK');
    expect(report.iceland.allowConfirm).toBe(false);
    expect(report.unmappedIcelandCids).not.toContain(
      'ICELAND_VEHICLE_RIVER_001',
    );
    expect(report.platform.allowConfirm).toBe(false);
    expect(report.platform.overallStatus).toBe('INFEASIBLE');
    expect(report.gateAligned).toBe(true);

    const river = report.mapped.find(
      (m) => m.icelandCid === 'ICELAND_VEHICLE_RIVER_001',
    );
    expect(river?.platformKey).toBe('RIVER_CROSSING_SELF_DRIVE');
    expect(river?.aligned).toBe(true);
    expect(river?.icelandBand).toBe('HARD');
    expect(river?.platformBand).toBe('HARD');
  });

  it('drive_cap_block: MAX_DAILY_DRIVE mapped HARD aligned', () => {
    const { fixtureId, snapshot } = fixtureDriveCapBlock();
    const report = svc.contrast({ snapshot, fixtureId });

    expect(report.iceland.allowConfirm).toBe(false);
    expect(report.platform.allowConfirm).toBe(false);
    expect(report.gateAligned).toBe(true);
    const drive = report.mapped.find(
      (m) => m.platformKey === 'MAX_DAILY_DRIVE',
    );
    expect(drive?.aligned).toBe(true);
    expect(drive?.icelandBand).toBe('HARD');
    expect(drive?.platformBand).toBe('HARD');
  });

  it('adapter produces EvaluatePlanInput with IS + roads LOADED', () => {
    const { snapshot } = fixtureGoldenCirclePass();
    const { evaluatePlanInput } = verificationSnapshotToEvaluatePlan(snapshot);
    expect(evaluatePlanInput.countryCode).toBe('IS');
    expect(evaluatePlanInput.dataAvailability?.roads).toBe('LOADED');
    expect(evaluatePlanInput.skipLegacyChecker).toBe(true);
    expect(evaluatePlanInput.plan.tripId).toBe(snapshot.tripId);
    expect(evaluatePlanInput.plan.days.length).toBe(1);
  });
});
