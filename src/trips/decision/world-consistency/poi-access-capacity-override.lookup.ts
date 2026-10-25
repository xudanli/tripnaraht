/**
 * Production lookup: PoiAccessCapacityService → PoiAccessOverrideLookup.
 * Tick-scoped authority port uses this; never treats field hints as SSOT.
 */

import { Injectable, Optional } from '@nestjs/common';
import { PoiAccessCapacityService } from '../../../poi-access-capacity/poi-access-capacity.service';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import type { PoiAccessOverrideLookup } from './poi-access-override-authority.port';

function preferClosureOverride(
  list: PoiAccessStatusOverride[],
): PoiAccessStatusOverride | null {
  const active = list.filter((o) => o.status === 'ACTIVE');
  if (!active.length) return null;
  const closed = active.find(
    (o) => o.ruleType === 'CLOSED' || o.ruleType === 'SEASONAL_CLOSURE',
  );
  return closed ?? active[0] ?? null;
}

@Injectable()
export class PoiAccessCapacityOverrideLookup
  implements PoiAccessOverrideLookup
{
  constructor(
    @Optional() private readonly capacity?: PoiAccessCapacityService,
  ) {}

  async findActiveOverride(
    poiId: string,
  ): Promise<PoiAccessStatusOverride | null> {
    if (!this.capacity) return null;
    const dateISO = new Date().toISOString().slice(0, 10);
    const list = await this.capacity.getStatusOverridesForPoiSlugs(
      [poiId.trim().toLowerCase()],
      dateISO,
    );
    return preferClosureOverride(list);
  }
}
