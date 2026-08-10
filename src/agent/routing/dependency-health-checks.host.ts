/**
 * 依赖健康检查注册宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DependencyHealthCheckService } from '../services/dependency-health-check.service';

export interface DependencyHealthChecksHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly dependencyHealthCheck?: DependencyHealthCheckService;
  readonly llmService?: any;
  readonly plannerAgent?: any;
  readonly gatekeeperAgent?: any;
  readonly complianceAgent?: any;
  readonly geoAgent?: any;
  readonly weatherAgent?: any;
  readonly costAgent?: any;
  readonly experienceAgent?: any;
  readonly decisionKernel?: any;
  readonly chunkRetrieval?: any;
  readonly mcpToolDispatcher?: any;
}
