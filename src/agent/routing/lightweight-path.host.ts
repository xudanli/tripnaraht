/**
 * Lightweight 短路路径宿主：day_view / workbench 读 Trip。
 */

import type { Logger } from '@nestjs/common';

export interface LightweightTripLookupHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug'>;
  /** 可选：无则 day_view/workbench 返回失败文案 */
  findTripForLightweight?(
    tripId: string,
    userId: string | undefined,
  ): Promise<{
    destination?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    TripDay?: Array<{
      id?: string;
      date?: Date | string | null;
      ItineraryItem?: Array<Record<string, unknown>>;
    }>;
  }>;
}
