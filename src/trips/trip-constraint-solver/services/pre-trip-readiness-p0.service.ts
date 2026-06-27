/**
 * Readiness P0 — 组装 POI Access + Experience Regret issues（feasibility-report）
 */

import { Injectable } from '@nestjs/common';
import { PoiAccessP0AssemblyService } from '../../../poi-access-capacity/services/poi-access-p0-assembly.service';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

@Injectable()
export class PreTripReadinessP0Service {
  constructor(private readonly assembly: PoiAccessP0AssemblyService) {}

  async buildP0Issues(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<FeasibilityIssueDto[]> {
    return this.assembly.buildFeasibilityIssues(trip);
  }
}
