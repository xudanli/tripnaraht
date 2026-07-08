import { buildPlanVersionIdempotencyKey } from '../../trips/guardian-decision-core/plan-version/plan-version.service';
import {
  buildGuideAcceptHarnessStack,
  GUIDE_E2E_CANDIDATE_ID,
  GUIDE_E2E_SESSION_ID,
  GUIDE_E2E_USER_ID,
  minimalGuideAcceptDraft,
  seedGuideAcceptHarnessState,
} from './guide-canonical-accept.harness.util';

describe('Guide canonical accept L2 flow (E2E harness)', () => {
  const prevAccept = process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE;
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevMat = process.env.RFC001_ITINERARY_MATERIALIZE;
  const prevGuard = process.env.EFFECTIVE_PLAN_WRITE_GUARD;

  beforeEach(() => {
    process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = '1';
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.RFC001_ITINERARY_MATERIALIZE = '1';
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = '1';
  });

  afterEach(() => {
    if (prevAccept === undefined) delete process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE;
    else process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE = prevAccept;
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevMat === undefined) delete process.env.RFC001_ITINERARY_MATERIALIZE;
    else process.env.RFC001_ITINERARY_MATERIALIZE = prevMat;
    if (prevGuard === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    else process.env.EFFECTIVE_PLAN_WRITE_GUARD = prevGuard;
  });

  it('GUIDE-L2-001: no effective plan before accept; items + effective after execute', async () => {
    const state = seedGuideAcceptHarnessState();
    const { acceptService, planVersionStore, ledgerStore, state: harnessState } =
      buildGuideAcceptHarnessStack(state);

    const draft = minimalGuideAcceptDraft();
    const result = await acceptService.acceptAndExecute({
      userId: GUIDE_E2E_USER_ID,
      sessionId: GUIDE_E2E_SESSION_ID,
      planCandidateId: GUIDE_E2E_CANDIDATE_ID,
      variant: 'balanced',
      itineraryDraft: draft,
      travelContext: { startDate: '2026-08-15', countryCode: 'IS', transportMode: 'self_drive' },
      countryCode: 'IS',
    });

    expect(result).not.toBeNull();
    expect(result!.canonicalExecuted).toBe(true);
    expect(result!.itemCount).toBe(2);

    const effectiveId = await planVersionStore.getEffectivePlanVersionId(result!.tripId);
    expect(effectiveId).toBe(result!.effectivePlanVersionId);

    expect(harnessState.items.size).toBe(2);
    expect([...harnessState.items.keys()].some((id) => id.includes('slot_blue_lagoon'))).toBe(
      true,
    );

    const record = await ledgerStore.getDecision(result!.tripId, result!.decisionId);
    expect(record?.recordStatus).toBe('EFFECTIVE');
    expect(record?.effectivePlanVersionId).toBe(result!.effectivePlanVersionId);

    const tripMeta = harnessState.trips.get(result!.tripId)?.metadata;
    expect(tripMeta?.guideCanonicalDecisionId).toBe(result!.decisionId);

    const session = harnessState.sessions.get(GUIDE_E2E_SESSION_ID);
    const summary = session?.understandingSummary as {
      canonicalDecision?: { acceptedTripId?: string; effectivePlanVersionId?: string };
    };
    expect(summary?.canonicalDecision?.acceptedTripId).toBe(result!.tripId);
    expect(summary?.canonicalDecision?.effectivePlanVersionId).toBe(result!.effectivePlanVersionId);
  });

  it('GUIDE-L2-002: repeat execute returns idempotent replay', async () => {
    const state = seedGuideAcceptHarnessState();
    const { acceptService, executor, planVersionStore } = buildGuideAcceptHarnessStack(state);

    const result = await acceptService.acceptAndExecute({
      userId: GUIDE_E2E_USER_ID,
      sessionId: GUIDE_E2E_SESSION_ID,
      planCandidateId: GUIDE_E2E_CANDIDATE_ID,
      variant: 'balanced',
      itineraryDraft: minimalGuideAcceptDraft(),
      travelContext: { startDate: '2026-08-15', countryCode: 'IS' },
      countryCode: 'IS',
    });

    expect(result).not.toBeNull();

    const replay = await executor.execute({
      tripId: result!.tripId,
      decisionId: result!.decisionId,
      idempotencyKey: buildPlanVersionIdempotencyKey(result!.tripId, result!.decisionId),
    });

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.planVersion.planVersionId).toBe(result!.effectivePlanVersionId);
    expect(await planVersionStore.getEffectivePlanVersionId(result!.tripId)).toBe(
      result!.effectivePlanVersionId,
    );
  });
});
