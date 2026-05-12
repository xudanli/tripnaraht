/**
 * Mock 回归：带 tripId 调用 PlanningWorkbench.getWorldModelData，打印 strategyLayer / collaborationBridge。
 *
 * 运行：npx tsx scripts/regression-world-model-bridge.ts
 *
 * 说明：tsx 场景下显式 useFactory 注入域 Agent 与 MAC，避免仅靠 emitDecoratorMetadata 时可选参数错位。
 */

import { Test } from '@nestjs/testing';
import { PlanningWorkbenchAgentService } from '../src/agent/services/planning-workbench-agent.service';
import { CostAgentService } from '../src/agent/services/domain-agents/cost-agent.service';
import { ExperienceAgentService } from '../src/agent/services/domain-agents/experience-agent.service';
import { MultiAgentCollaborationService } from '../src/skills/world/services/multi-agent-collaboration.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { PlanContext } from '../src/skills/plan/shared/plan-state.types';

async function main() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CostAgentService,
      ExperienceAgentService,
      MultiAgentCollaborationService,
      { provide: PrismaService, useValue: {} },
      {
        provide: PlanningWorkbenchAgentService,
        useFactory: (
          cost: CostAgentService,
          experience: ExperienceAgentService,
          mac: MultiAgentCollaborationService,
        ) =>
          new PlanningWorkbenchAgentService(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            cost,
            experience,
            undefined,
            undefined,
            undefined,
            mac,
          ),
        inject: [CostAgentService, ExperienceAgentService, MultiAgentCollaborationService],
      },
    ],
  }).compile();

  const pw = moduleRef.get(PlanningWorkbenchAgentService);
  const tripId = `regression-${Date.now()}`;

  const context: PlanContext = {
    destination: { country: 'Iceland', city: 'Reykjavik' },
    days: 7,
    mustDo: ['极光玻璃屋 Aurora glass igloo'],
    constraints: {
      time: {
        days: 7,
        startDate: '2026-12-01',
        endDate: '2026-12-07',
      },
      budget: { total: 900, currency: 'USD' },
      accommodation: { level: 'luxury' },
    },
  };

  const wm = await pw.getWorldModelData(context, { tripId });

  const out = {
    tripId,
    collaborationBridge: wm.collaborationBridge,
    strategyLayer: wm.strategyLayer,
    note:
      'UnifiedWorldModel.buildUnifiedWorldModel({ tripId }) 会从同一 MultiAgentCollaborationService 实例读取 strategyLayer（部署时需同进程 / 同 tripId）。',
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
