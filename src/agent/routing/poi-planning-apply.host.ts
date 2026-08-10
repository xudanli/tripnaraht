/**
 * STATE_UPDATE 写入 poiPlanning slice 宿主。
 */

import type { Logger } from '@nestjs/common';

export interface PoiPlanningApplyHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly regionAnchorPlanning?: {
    resolveAndBuildSlice: (userRoute: any, query?: string) => any;
  };
}
