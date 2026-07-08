import { getAuthorityCase } from '../authority/authority-cases.registry';
import { assertLedgerClosurePresent, expectAuthorityPass } from '../assertions/canonical-authority.assertions';
import { runAuthorityCaseWithContext } from './run-authority-case-with-context.util';
import { assertAuthorityResultHasAnchor } from './authority-context-anchor.util';
import { buildRoadStatusChangedEvent } from '../../../trips/guardian-decision-core/evidence/road-status-changed.event';
import { buildItemSegmentId } from '../../../trips/guardian-decision-core/detection/road-close-impact-analyzer';
import { buildPlanVersionIdempotencyKey } from '../../../trips/guardian-decision-core/plan-version/plan-version.service';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from '../../../trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';
import { extractRfc001LedgerClosureKinds } from './rfc001-ledger-closure-kinds.util';

/**
 * AU-P1-008 — Decision Ledger must record full Problem → Execution closure.
 */
describe('AU-P1-008 — Decision Ledger closure', () => {
  const caseDef = getAuthorityCase('AU-P1-008')!;
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('assertLedgerClosurePresent fails when kinds missing', async () => {
    const result = await runAuthorityCaseWithContext({
      caseId: `${caseDef.caseId}-unit`,
      tripId: HARNESS_TRIP_ID,
      run: async () => assertLedgerClosurePresent({ presentKinds: ['PROBLEM', 'EVIDENCE'] }),
    });
    expect(result.pass).toBe(false);
    assertAuthorityResultHasAnchor(result);
  });

  it('assertLedgerClosurePresent passes when all kinds present', async () => {
    const result = await runAuthorityCaseWithContext({
      caseId: `${caseDef.caseId}-unit-full`,
      tripId: HARNESS_TRIP_ID,
      run: async () =>
        assertLedgerClosurePresent({
          presentKinds: [
            'PROBLEM',
            'EVIDENCE',
            'CONSTRAINTS',
            'CANDIDATES',
            'EVALUATION',
            'SELECTED_DECISION',
            'REJECTED_ALTERNATIVES',
            'PLAN_CHANGE',
            'EXECUTION_STATUS',
          ],
        }),
    });
    expect(result.pass).toBe(true);
    assertAuthorityResultHasAnchor(result);
  });

  it(caseDef.description, async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);

    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE),
    });

    const run = await stack.runner.runFullFromEvent(event);
    expect(run.record).not.toBeNull();

    const world = await stack.worldStore.readStore(HARNESS_TRIP_ID);
    const evidenceRefCount = world.assertions.flatMap((a) => a.source.evidenceRefs).length;

    await stack.authorization.authorize({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
      choice: 'cand_a',
    });

    const key = buildPlanVersionIdempotencyKey(HARNESS_TRIP_ID, run.record!.decisionId);
    const executed = await stack.executor.execute({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });

    const record = await stack.ledgerStore.getDecision(HARNESS_TRIP_ID, run.record!.decisionId);
    const presentKinds = extractRfc001LedgerClosureKinds({
      problem: run.problem,
      workspace: run.workspace,
      record: record ?? executed.record,
      planVersion: executed.planVersion,
      evidenceRefCount,
    });

    const result = await runAuthorityCaseWithContext({
      caseId: caseDef.caseId,
      tripId: HARNESS_TRIP_ID,
      runtimeAuthority: 'CANONICAL',
      run: async () => assertLedgerClosurePresent({ presentKinds }),
    });

    expectAuthorityPass(result);
    assertAuthorityResultHasAnchor(result, { runtimeAuthority: 'CANONICAL' });
  });
});
