import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Rfc001DecisionCenterReadModelService } from '../src/trips/guardian-decision-core/read-model/rfc001-decision-center-read-model.service';
import type { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const tripId = '3e4a1058-9218-467f-988a-c18008a14385';
  const problemId = 'problem_load_3e4a1058_1782831128596';

  const { Rfc001DecisionProblemStoreService } = await import(
    '../src/trips/guardian-decision-core/persistence/rfc001-decision-problem.store'
  );
  const { Rfc001DecisionLedgerStoreService } = await import(
    '../src/trips/guardian-decision-core/persistence/rfc001-decision-ledger.store'
  );
  const { DecisionWorkspaceService } = await import(
    '../src/trips/guardian-decision-core/workspace/decision-workspace.service'
  );
  const { Rfc001PlanVersionStoreService } = await import(
    '../src/trips/guardian-decision-core/plan-version/plan-version.store'
  );
  const { WorldStateStoreService } = await import(
    '../src/trips/guardian-decision-core/evidence/world-state-store.service'
  );

  const readModel = new Rfc001DecisionCenterReadModelService(
    prisma,
    new Rfc001DecisionProblemStoreService(prisma),
    new Rfc001DecisionLedgerStoreService(prisma),
    new DecisionWorkspaceService(prisma),
    new Rfc001PlanVersionStoreService(prisma),
    new WorldStateStoreService(prisma),
  );

  const view = await readModel.getProblemView(tripId, problemId);
  console.log(
    JSON.stringify(
      {
        title: view.problemSummary.title,
        triggerDay: view.impactScopeView?.trigger.dayIndex,
        primaryDayIndex: view.impactScopeView?.narrative.params.primaryDayIndex,
        dayIndexes: view.impactScopeView?.narrative.params.dayIndexes,
        optionCaps: view.options.map((o) => ({
          id: o.id,
          executionCapability: o.executionCapability,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
