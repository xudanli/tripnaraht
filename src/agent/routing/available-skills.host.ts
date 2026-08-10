/**
 * 可用 Skills 列表宿主。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export interface AvailableSkillsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: {
    getAllSkills: () => any[];
    getAllSkillsForEmergencyConstraints?: (
      emergencyConstraints?: RouteAndRunRequestDto['emergency_constraints'],
    ) => any[];
  };
}
