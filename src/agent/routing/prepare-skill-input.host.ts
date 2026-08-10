/**
 * prepareSkillInput 宿主：国家码提取 / handoff 消毒仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

export interface PrepareSkillInputHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  extractCountryCodeFromMessage(message: string): string | undefined;

  sanitizeOrchestrationHandoff(
    request: RouteAndRunRequestDto,
    value: unknown,
  ): unknown;
}

export type { RouteAndRunRequestDto };
