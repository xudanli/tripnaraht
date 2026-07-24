/**
 * Test / harness helper — build shared finalize service stack.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import { DecisionCoreService } from '../services/decision-core.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionStoreService } from '../plan-version/plan-version.store';
import { Rfc001PlanVersionService } from '../plan-version/plan-version.service';
import { Rfc001DecisionFinalizeService } from '../execution/rfc001-decision-finalize.service';
import type { Rfc001DecisionSemanticsProjectorService } from '../read-model/rfc001-decision-semantics-projector.service';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';

export function buildRfc001DecisionFinalizeService(
  prisma: PrismaService,
  opts?: {
    ledgerStore?: Rfc001DecisionLedgerStoreService;
    v15Projector?: Rfc001DecisionSemanticsProjectorService;
  },
): Rfc001DecisionFinalizeService {
  const workspaceService = new DecisionWorkspaceService(prisma);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const ledgerStore =
    opts?.ledgerStore ?? new Rfc001DecisionLedgerStoreService(prisma);
  const planVersionStore = new Rfc001PlanVersionStoreService(
    prisma,
    new EffectivePlanWriteGuardService(),
  );
  const planVersionService = new Rfc001PlanVersionService(prisma, planVersionStore);
  return new Rfc001DecisionFinalizeService(
    new DecisionCoreService(),
    workspaceService,
    problemStore,
    ledgerStore,
    planVersionService,
    opts?.v15Projector,
  );
}
