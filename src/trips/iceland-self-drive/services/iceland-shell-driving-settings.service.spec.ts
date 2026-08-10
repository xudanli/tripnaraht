import { IcelandInitialPlanSeedService } from './iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './iceland-initial-plan-arrange-projector.service';
import { IcelandInitialPlanPipelineService } from './iceland-initial-plan-pipeline.service';
import { IcelandTripCreateOrchestrator } from './iceland-trip-create.orchestrator';
import { IcelandInitialPlanProposalStore } from './iceland-initial-plan-proposal.store';
import { IcelandInitialPlanPreflightService } from './iceland-initial-plan-preflight.service';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandInitialPlanRepairOnceService } from './iceland-initial-plan-repair-once.service';
import { IcelandInitialPlanVerificationBridgeService } from './iceland-initial-plan-verification-bridge.service';
import { IcelandTripShellRepository } from './iceland-trip-shell.repository';
import { IcelandStoredProposalRepository } from './iceland-stored-proposal.repository';
import { IcelandAppliedPlanRepository } from './iceland-applied-plan.repository';
import { IcelandInitialPlanPreviewService } from './iceland-initial-plan-preview.service';
import { IcelandShadowVsPlatformContrastService } from './iceland-shadow-vs-platform-contrast.service';
import { IcelandShellDrivingSettingsService } from './iceland-shell-driving-settings.service';
import { isMemoryShellTripId } from '../utils/iceland-memory-shell-trip-id.util';

function build() {
  const shells = new IcelandTripShellRepository();
  const proposals = new IcelandStoredProposalRepository();
  const applied = new IcelandAppliedPlanRepository();
  const pipeline = new IcelandInitialPlanPipelineService(
    new IcelandInitialPlanSeedService(),
    new IcelandInitialPlanArrangeProjector(),
  );
  const orchestrator = new IcelandTripCreateOrchestrator(
    pipeline,
    new IcelandInitialPlanProposalStore(),
    new IcelandInitialPlanVerificationBridgeService(
      new IcelandInitialPlanPreflightService(),
      new IcelandShadowUnifiedAssessmentService(),
      new IcelandInitialPlanRepairOnceService(),
    ),
  );
  const preview = new IcelandInitialPlanPreviewService(
    shells,
    proposals,
    applied,
    {
      materialize: jest.fn(),
    } as never,
    orchestrator,
    new IcelandShadowVsPlatformContrastService(
      new IcelandShadowUnifiedAssessmentService(),
    ),
  );
  const shellSettings = new IcelandShellDrivingSettingsService(
    shells,
    proposals,
    preview,
  );
  return { shells, proposals, preview, shellSettings };
}

describe('IcelandShellDrivingSettingsService', () => {
  const owner = 'owner-shell-settings';

  it('detects memory shell trip ids', () => {
    expect(isMemoryShellTripId('trip_718d77e8d3774684')).toBe(true);
    expect(isMemoryShellTripId('5872f534-4fdf-483d-9e5a-464d3f36935d')).toBe(
      false,
    );
  });

  it('GET returns settings for shell with soft-auth owner', () => {
    const { preview, shellSettings } = build();
    const shell = preview.createTripShell(owner, {
      destinationCode: 'IS',
      startDate: '2026-07-22',
      endDate: '2026-07-25',
      regionIds: ['golden_circle'],
      vehicleProfile: { is4wd: false, allowsFRoad: false },
    });
    expect(isMemoryShellTripId(shell.tripId)).toBe(true);

    const data = shellSettings.get(owner, shell.tripId);
    expect(data.tripId).toBe(shell.tripId);
    expect(data.contextVersion).toBe('1');
    expect(data.items.some((i) => i.code === 'vehicle')).toBe(true);
  });

  it('PATCH bumps context, syncs vehicleProfile, regenerates preview', async () => {
    const { preview, shellSettings, shells, proposals } = build();
    const shell = preview.createTripShell(owner, {
      destinationCode: 'IS',
      startDate: '2026-07-22',
      endDate: '2026-07-28',
      regionIds: ['south_coast', 'golden_circle'],
      vehicleProfile: { is4wd: false, allowsFRoad: false },
    });
    const first = await preview.createProposal(owner, shell.tripId);
    expect(first.proposalId).toBeTruthy();

    const patched = await shellSettings.patch(owner, shell.tripId, {
      vehicle: { is4wd: true, vehicleClass: 'suv_4wd' },
    });

    expect(patched.previewRegenerated).toBe(true);
    expect(patched.activeProposalId).toBeTruthy();
    expect(patched.activeProposalId).not.toBe(first.proposalId);
    expect(patched.contextVersion).toBe('2');
    expect(patched.writesPlanVersion).toBe(false);

    const updated = shells.get(shell.tripId)!;
    expect(updated.contextVersion).toBe(2);
    expect(updated.contextPayload.vehicleProfile?.is4wd).toBe(true);
    expect(updated.activeProposalId).toBe(patched.activeProposalId);

    const old = proposals.get(first.proposalId);
    expect(old?.status === 'SUPERSEDED' || old?.status === 'STALE').toBe(true);

    const next = proposals.get(patched.activeProposalId!);
    expect(next?.contextVersion).toBe(2);
    expect(next?.status).not.toBe('SUPERSEDED');
  });
});
