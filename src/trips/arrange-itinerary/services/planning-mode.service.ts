import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  PLANNING_WORKBENCH_METADATA_KEY,
  readPlanningWorkbenchMode,
  type PlanningWorkbenchMode,
} from '../../utils/planning-workbench-mode.util';

export type { PlanningWorkbenchMode };

export { PLANNING_WORKBENCH_METADATA_KEY };

export interface PlanningModeView {
  tripId: string;
  mode: PlanningWorkbenchMode;
  description: string;
}

const MODE_DESCRIPTIONS: Record<PlanningWorkbenchMode, string> = {
  manual: '手动规划：AI 仅提醒冲突与局部建议，不主动重排',
  copilot: '协同规划：AI 可生成草案、发现空档、提出修复建议，但不自动覆盖正式行程',
};

@Injectable()
export class PlanningModeService {
  constructor(private readonly prisma: PrismaService) {}

  async getMode(tripId: string): Promise<PlanningModeView> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { metadata: true },
    });
    const mode = this.readMode(trip.metadata);
    return { tripId, mode, description: MODE_DESCRIPTIONS[mode] };
  }

  async setMode(tripId: string, mode: PlanningWorkbenchMode): Promise<PlanningModeView> {
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    const metadata = { ...((trip.metadata as Record<string, unknown> | null) ?? {}) };
    metadata[PLANNING_WORKBENCH_METADATA_KEY] = { mode };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    return { tripId, mode, description: MODE_DESCRIPTIONS[mode] };
  }

  readMode(metadata: unknown): PlanningWorkbenchMode {
    return readPlanningWorkbenchMode(metadata);
  }
}
