/**
 * POI Access P0 — 组装 feasibility issues（共享 readiness / constraint-solver）
 */

import { Injectable } from '@nestjs/common';
import { PoiAccessCapacityEngineService } from './poi-access-capacity-engine.service';
import {
  poiAccessEvaluationToFeasibilityIssue,
  buildExperienceRegretIssue,
} from '../utils/poi-access-feasibility-mapper.util';
import { getBuiltinRulesForPoiSlugs } from '../fixtures/iceland-poi-registry';
import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import {
  estimatePlanRegret,
  isRegretBoundConfirmed,
  readExperienceRegretBound,
  shouldRequireRegretConfirmation,
} from '../../trips/trip-constraint-solver/utils/experience-regret-bound.util';

@Injectable()
export class PoiAccessP0AssemblyService {
  constructor(private readonly accessEngine: PoiAccessCapacityEngineService) {}

  async buildFeasibilityIssues(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<FeasibilityIssueDto[]> {
    const issues: FeasibilityIssueDto[] = [];

    const evaluations = await this.accessEngine.evaluateTrip(trip.id);
    const poiIds = [...new Set(evaluations.map((e) => e.poiId))];
    const rules = getBuiltinRulesForPoiSlugs(poiIds);

    for (const evalRow of evaluations) {
      const issue = poiAccessEvaluationToFeasibilityIssue(evalRow, rules);
      if (issue) issues.push(issue);
    }

    if (shouldRequireRegretConfirmation(trip.metadata, trip)) {
      const bound = readExperienceRegretBound(trip.metadata);
      const regretIssue = buildExperienceRegretIssue({
        tripId: trip.id,
        planRegretEstimate: estimatePlanRegret(trip.metadata),
        confirmedUpperBound: isRegretBoundConfirmed(trip.metadata)
          ? bound?.confirmedUpperBound
          : undefined,
      });
      if (regretIssue) issues.push(regretIssue);
    }

    return issues;
  }
}
