/**
 * User constraints SSOT → ConstraintFact (P1 skeleton; full plan evaluation TBD).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TripConstraintRegistryService } from '../../../trips/trip-constraint-solver/services/trip-constraint-registry.service';
import type { ConstraintFact } from '../contracts/constraint-fact';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type { TripPlan } from '../../../trips/decision/plan-model';
import { evaluateUserConstraintFacts } from './user-constraint-evaluator.util';
import type { TripConstraint } from '../../../trips/trip-constraint-solver/types/trip-constraint.types';

@Injectable()
export class UserConstraintProvider {
  private readonly logger = new Logger(UserConstraintProvider.name);

  constructor(
    @Optional() private readonly registry?: TripConstraintRegistryService,
  ) {}

  async loadFacts(tripId: string, userId?: string): Promise<ConstraintFact[]> {
    if (!this.registry || !userId) {
      return [];
    }

    try {
      const list = await this.registry.list(tripId, userId, {});
      const active = list.items.filter(
        (c) => c.status === 'ACTIVE' || c.status === 'LOCKED',
      );
      return active.map((c) => this.mapTripConstraintToFact(tripId, c));
    } catch (error) {
      this.logger.warn(
        `UserConstraintProvider.loadFacts failed trip=${tripId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private mapTripConstraintToFact(tripId: string, constraint: TripConstraint): ConstraintFact {
    return {
      factId: `user_${constraint.id}`,
      type: constraint.category,
      subject: {
        type: mapScopeType(constraint.scope.type),
        id: constraint.scope.ids?.[0] ?? tripId,
      },
      value: {
        operator: constraint.operator,
        value: constraint.value,
        type: constraint.type,
        label: constraint.name,
        allowRelaxation: constraint.allowRelaxation,
      },
      source: {
        provider: 'trip-constraints-api',
        sourceType: constraint.source.type === 'OFFICIAL_RULE' ? 'OFFICIAL' : 'USER',
        retrievedAt: new Date().toISOString(),
      },
      confidence: 0.9,
      freshnessStatus: constraint.status === 'OUTDATED' ? 'STALE' : 'FRESH',
    };
  }

  async evaluate(input: {
    tripId: string;
    userId?: string;
    plan?: TripPlan;
    candidateId?: string;
  }): Promise<{ facts: ConstraintFact[]; assertions: ConstraintAssertion[] }> {
    const facts = await this.loadFacts(input.tripId, input.userId);
    const assertions = evaluateUserConstraintFacts({
      tripId: input.tripId,
      facts,
      plan: input.plan,
      candidateId: input.candidateId,
    });
    return { facts, assertions };
  }
}

function mapScopeType(
  scope: TripConstraint['scope']['type'],
): ConstraintFact['subject']['type'] {
  switch (scope) {
    case 'ROUTE_SEGMENT':
      return 'ROAD_SEGMENT';
    case 'ITEM':
      return 'ACTIVITY';
    case 'MEMBER':
    case 'MEMBER_GROUP':
      return 'MEMBER';
    case 'DAY':
      return 'DAY';
    default:
      return 'TRIP';
  }
}
