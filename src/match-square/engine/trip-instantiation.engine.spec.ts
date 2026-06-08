import { parseVibeFreeTextWithRules, buildVibeLlmParseViewFromPayload, attachVibeParseSnapshot } from './vibe-llm-parse.engine';
import { attachTrekkingOrchestrationSnapshot } from './trekking-vibe-orchestration.engine';
import { buildTripInstantiationPlan } from './trip-instantiation.engine';

const LAUGAVEGUR_TEXT =
  '2026年盛夏冰岛兰格维格 Laugavegur 55公里重装，Landmannalaugar 到 Þórsmörk，12.5米 DEM 离线 3D 路线，冰川强涉水，LNT Plan B。';

describe('trip-instantiation.engine', () => {
  it('plans trekking_spawn strategy when sealed iceland post has live orchestration', () => {
    const payload = parseVibeFreeTextWithRules(LAUGAVEGUR_TEXT);
    const view = buildVibeLlmParseViewFromPayload({ ...payload, source_text: LAUGAVEGUR_TEXT });
    let snapshot = attachVibeParseSnapshot({}, view.payload, view);
    if (view.trekkingOrchestration) {
      snapshot = attachTrekkingOrchestrationSnapshot(snapshot, view.trekkingOrchestration);
    }

    const plan = buildTripInstantiationPlan({
      post: {
        id: 'post-1',
        captainUserId: 'captain-1',
        status: 'closed',
        slotsFilled: 2,
        slotsNeeded: 2,
        captainPersonaSnapshot: snapshot,
      },
      approvedApplications: [{ id: 'app-1', applicantUserId: 'member-1' }],
    });

    expect(plan.canInstantiate).toBe(true);
    expect(plan.strategy).toBe('trekking_spawn');
    expect(plan.routeDirectionName).toBe('IS_LAUGAVEGUR');
    expect(plan.contextualCardIds).toContain('offline_dem_pace_corridor');
    expect(plan.crew).toHaveLength(2);
  });

  it('blocks when recruitment not sealed', () => {
    const plan = buildTripInstantiationPlan({
      post: {
        id: 'post-2',
        captainUserId: 'captain-1',
        status: 'active',
        slotsFilled: 1,
        slotsNeeded: 2,
        captainPersonaSnapshot: {},
      },
      approvedApplications: [],
    });

    expect(plan.canInstantiate).toBe(false);
    expect(plan.blockReason).toContain('尚未成团');
  });

  it('allows instantiation after sovereign force lock with partial crew', () => {
    const sovereignSnapshot = {
      _sovereignForceLock_v1: {
        version: 'sovereign_force_lock_v1',
        lockedAt: new Date().toISOString(),
        lockedByUserId: 'captain-1',
        note: null,
        originalSlotsNeeded: 4,
        effectiveSlotsNeeded: 2,
        droppedOpenSlots: [],
        physicalDeficits: [],
        resilienceScore: 72,
        vaultRecalc: {
          previousSplitBase: 5,
          actualSplitBase: 3,
          budgetPerPersonCents: null,
          summaryLine: '分摊基数 5 人 → 3 人',
        },
        pendingApplicationsRejected: 1,
        taskRebalanceNote: null,
      },
    };

    const plan = buildTripInstantiationPlan({
      post: {
        id: 'post-3',
        captainUserId: 'captain-1',
        status: 'closed',
        slotsFilled: 2,
        slotsNeeded: 2,
        captainPersonaSnapshot: sovereignSnapshot,
      },
      approvedApplications: [
        { id: 'app-1', applicantUserId: 'member-1' },
        { id: 'app-2', applicantUserId: 'member-2' },
      ],
    });

    expect(plan.canInstantiate).toBe(true);
    expect(plan.crew).toHaveLength(3);
  });
});
