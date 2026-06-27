/**
 * Readiness score / trip 读模型 — 注入 POI Access findings
 */

import { Injectable } from '@nestjs/common';
import type { ReadinessScoreFinding } from '../../trips/readiness/types/coverage-map.types';
import { PoiAccessP0AssemblyService } from './poi-access-p0-assembly.service';
import { PoiAccessCapacityEngineService } from './poi-access-capacity-engine.service';
import { feasibilityIssueToReadinessFinding } from '../utils/poi-access-readiness-findings.util';

@Injectable()
export class PoiAccessReadinessBridgeService {
  constructor(
    private readonly engine: PoiAccessCapacityEngineService,
    private readonly assembly: PoiAccessP0AssemblyService,
  ) {}

  async buildReadinessFindings(trip: {
    id: string;
    destination: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<ReadinessScoreFinding[]> {
    if (!this.engine.isIcelandTrip(trip)) return [];

    const issues = await this.assembly.buildFeasibilityIssues({
      id: trip.id,
      status: trip.status,
      startDate: trip.startDate,
      metadata: trip.metadata,
    });

    return issues.map(feasibilityIssueToReadinessFinding);
  }
}
