/**
 * RESEARCH 前作用域 COW 无效化宿主。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { DecisionOsExecutionContext } from '../runtime/decision-os-execution-context';

export interface ResearchScopeInvalidationCowHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly researchPriorSnapshot?: {
    load: (request: RouteAndRunRequestDto) => Promise<Record<string, unknown> | null | undefined>;
  };

  resolveDosExecutionContext(
    request: RouteAndRunRequestDto,
  ): DecisionOsExecutionContext | undefined;
}
