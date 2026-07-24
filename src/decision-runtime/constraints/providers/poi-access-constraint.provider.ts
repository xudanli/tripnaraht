/**
 * POI Access → Gateway ConstraintAssertion provider (Phase 2).
 */

import { Injectable } from '@nestjs/common';
import { PoiAccessP0AssemblyService } from '../../../poi-access-capacity/services/poi-access-p0-assembly.service';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { feasibilityIssueToGatewayAssertion } from '../adapters/feasibility-issue-to-assertion.adapter';

@Injectable()
export class PoiAccessConstraintProvider {
  constructor(private readonly poiAccessP0: PoiAccessP0AssemblyService) {}

  async evaluateForTrip(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<ConstraintAssertion[]> {
    const issues = await this.poiAccessP0.buildFeasibilityIssues(trip);
    const accessIssues = issues.filter(
      (i) =>
        i.category === 'access_capacity' ||
        i.issueKind?.startsWith('poi_access') ||
        Boolean(i.visitorAccess),
    );
    return accessIssues.map((issue) => feasibilityIssueToGatewayAssertion(issue, trip.id));
  }
}
