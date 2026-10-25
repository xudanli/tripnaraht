/**
 * Production bridge: CGUS accept/outcome (+ TravelOutcome) → WmOutcomeValidationStore.
 *
 * Best-effort only — never throws into the Trip path.
 * Records only when a Decision-tick road/POI binding exists (A vs B measurable).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  CgusActualOutcomeV1,
  CgusDecisionRegret,
  CgusDecisionUserAction,
} from '../optimization/cgus-decision-trace.types';
import { DecisionTickPoiBindingStore } from '../world-consistency/decision-tick-poi-binding.store';
import { DecisionTickRoadBindingStore } from '../world-consistency/decision-tick-road-binding.store';
import {
  buildWmOutcomeValidationRecord,
  type OutcomeValidationImpactInput,
} from './build-wm-outcome-validation-record.util';
import {
  measurePoiClosedDecisionImpact,
  measureRoadClosedDecisionImpact,
} from './measure-decision-impact.util';
import type {
  OutcomeSuccess,
  SafetyOutcome,
  UserDecisionAction,
  WmOutcomeValidationRecord,
} from './wm-outcome-validation.types';
import { WmOutcomeValidationStore } from './wm-outcome-validation.store';

@Injectable()
export class WmOutcomeValidationBridgeService {
  private readonly logger = new Logger(WmOutcomeValidationBridgeService.name);

  constructor(
    private readonly store: WmOutcomeValidationStore,
    @Optional() private readonly roadStore?: DecisionTickRoadBindingStore,
    @Optional() private readonly poiStore?: DecisionTickPoiBindingStore,
  ) {}

  /**
   * After CGUS user action is persisted.
   * Writes a provisional record (outcome/safety often UNKNOWN until later).
   */
  onCgusUserAction(input: {
    tripId: string;
    decisionId: string;
    userAction: CgusDecisionUserAction;
    overrideNote?: string;
    recordedAt?: string;
  }): WmOutcomeValidationRecord | null {
    try {
      const impact = this.measureLiveImpact(input.tripId);
      if (!impact) {
        this.logger.debug(
          `WmOutcomeValidation skip action: no tick binding tripId=${input.tripId}`,
        );
        return null;
      }

      const record = buildWmOutcomeValidationRecord({
        tripId: input.tripId,
        tickId: input.decisionId,
        impact,
        world: this.worldSliceFromLive(input.tripId, impact),
        served: 'WITH_BRIDGE',
        user: {
          action: this.mapUserAction(input.userAction),
          overrideNote: input.overrideNote,
        },
        execution: { status: 'UNKNOWN', repairOccurred: false },
        outcome: { success: 'UNKNOWN' },
        safety: { result: 'UNKNOWN' },
        recordedAt: input.recordedAt,
        recordId: `wm_ov_${input.tripId}_${input.decisionId}`.slice(0, 120),
      });

      this.store.put(record);
      this.store.appendJsonl(record);
      return record;
    } catch (err) {
      this.logger.warn(
        `WmOutcomeValidation onCgusUserAction failed tripId=${input.tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * After CGUS outcome (+ regret) is persisted. Merges into the accept-tick record.
   */
  onCgusOutcome(input: {
    tripId: string;
    decisionId: string;
    actualOutcome: CgusActualOutcomeV1;
    decisionRegret: CgusDecisionRegret;
    recordedAt?: string;
  }): WmOutcomeValidationRecord | null {
    try {
      const existing =
        this.store.findByTickId(input.tripId, input.decisionId) ??
        this.store.latest(input.tripId);
      if (!existing) {
        this.logger.debug(
          `WmOutcomeValidation onCgusOutcome: no prior record tripId=${input.tripId}`,
        );
        return null;
      }

      const mapped = this.mapCgusOutcome(
        input.actualOutcome,
        input.decisionRegret,
      );
      const record = buildWmOutcomeValidationRecord({
        tripId: existing.tripId,
        tickId: existing.tickId,
        impact: this.impactFromRecord(existing),
        world: existing.world,
        served: existing.served,
        user: existing.user,
        execution: {
          status: input.actualOutcome.completed ? 'EXECUTED' : 'PARTIAL',
          repairOccurred: existing.execution.repairOccurred,
          repairCodes: existing.execution.repairCodes,
        },
        outcome: mapped.outcome,
        experience: mapped.experience,
        safety: mapped.safety,
        recordedAt: input.recordedAt,
        recordId: existing.recordId,
      });

      this.store.put(record);
      this.store.appendJsonl(record);
      return record;
    } catch (err) {
      this.logger.warn(
        `WmOutcomeValidation onCgusOutcome failed tripId=${input.tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * After TravelOutcome row is written (Trip COMPLETED).
   * Backfills outcome/experience on the latest accept record for the trip.
   */
  onTravelOutcomePersisted(input: {
    tripId: string;
    success: string;
    overallScore?: number;
    satisfaction?: number;
    recordedAt?: string;
  }): WmOutcomeValidationRecord | null {
    try {
      const existing = this.store.latest(input.tripId);
      if (!existing) {
        this.logger.debug(
          `WmOutcomeValidation onTravelOutcome: no accept record tripId=${input.tripId}`,
        );
        return null;
      }

      const outcomeSuccess = this.mapTravelSuccess(input.success);
      const record = buildWmOutcomeValidationRecord({
        tripId: existing.tripId,
        tickId: existing.tickId,
        impact: this.impactFromRecord(existing),
        world: existing.world,
        served: existing.served,
        user: existing.user,
        execution: {
          status: 'EXECUTED',
          repairOccurred: existing.execution.repairOccurred,
          repairCodes: existing.execution.repairCodes,
        },
        outcome: {
          success: outcomeSuccess,
          notes: `TravelOutcome success=${input.success} score=${input.overallScore ?? 'n/a'}`,
        },
        experience: {
          ...existing.experience,
          satisfaction:
            input.satisfaction != null
              ? input.satisfaction
              : existing.experience.satisfaction,
        },
        safety: existing.safety,
        recordedAt: input.recordedAt,
        recordId: existing.recordId,
      });

      this.store.put(record);
      this.store.appendJsonl(record);
      return record;
    } catch (err) {
      this.logger.warn(
        `WmOutcomeValidation onTravelOutcome failed tripId=${input.tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private measureLiveImpact(
    tripId: string,
  ): OutcomeValidationImpactInput | null {
    const road = this.roadStore?.getLatestBinding(tripId);
    if (road) {
      return measureRoadClosedDecisionImpact({ binding: road });
    }
    const poi = this.poiStore?.getLatest(tripId);
    if (poi) {
      return measurePoiClosedDecisionImpact({ materialization: poi });
    }
    return null;
  }

  private worldSliceFromLive(
    tripId: string,
    impact: OutcomeValidationImpactInput,
  ): WmOutcomeValidationRecord['world'] {
    if (impact.subject === 'ROAD') {
      const m = this.roadStore?.getLatestBinding(tripId)?.materialization;
      return {
        freshness: 'FRESH',
        authority: m?.sourceVersion?.authority ?? 'UNKNOWN',
        sourceVersion: m?.sourceVersion,
      };
    }
    if (impact.subject === 'POI') {
      const m = this.poiStore?.getLatest(tripId);
      return {
        freshness: 'FRESH',
        authority: m?.sourceVersion?.authority ?? 'UNKNOWN',
        sourceVersion: m?.sourceVersion,
      };
    }
    return { freshness: 'UNKNOWN', authority: 'UNKNOWN' };
  }

  private impactFromRecord(
    record: WmOutcomeValidationRecord,
  ): OutcomeValidationImpactInput {
    return {
      subject: record.subject,
      subjectId: record.subjectId,
      tripId: record.tripId,
      tickId: record.tickId,
      withoutBridge: {
        gateBlocks: record.decisionWithoutBridge.gateBlocks,
        gateRequiresVerification:
          record.decisionWithoutBridge.gateRequiresVerification,
        cgusFeasible: record.decisionWithoutBridge.cgusFeasible,
        worldSees: record.decisionWithoutBridge.worldSees ?? 'ABSENT',
      },
      withBridge: {
        gateBlocks: record.decisionWithBridge.gateBlocks,
        gateRequiresVerification:
          record.decisionWithBridge.gateRequiresVerification,
        cgusFeasible: record.decisionWithBridge.cgusFeasible,
        worldSees: record.decisionWithBridge.worldSees ?? 'ABSENT',
      },
      decisionWouldDifferIfBridgeDeleted: record.verdict.decisionDiffered,
    };
  }

  private mapUserAction(action: CgusDecisionUserAction): UserDecisionAction {
    if (action === 'ACCEPT') return 'ACCEPT';
    if (action === 'OVERRIDE') return 'OVERRIDE';
    if (action === 'REJECT_ALL') return 'REJECT';
    return 'UNKNOWN';
  }

  private mapCgusOutcome(
    actual: CgusActualOutcomeV1,
    regret: CgusDecisionRegret,
  ): {
    outcome: WmOutcomeValidationRecord['outcome'];
    experience: WmOutcomeValidationRecord['experience'];
    safety: WmOutcomeValidationRecord['safety'];
  } {
    let success: OutcomeSuccess = 'UNKNOWN';
    if (actual.safetyIncident) success = 'FAILURE';
    else if (actual.completed) success = 'SUCCESS';
    else success = 'PARTIAL';

    let safety: SafetyOutcome = 'UNKNOWN';
    if (actual.safetyIncident) safety = 'RISK_MATERIALIZED';
    else if (actual.completed && !actual.safetyIncident) safety = 'NEUTRAL';

    const experience: WmOutcomeValidationRecord['experience'] = {};
    if (regret === 'NONE') experience.regret = false;
    else if (regret === 'LOW' || regret === 'MEDIUM' || regret === 'HIGH') {
      experience.regret = true;
    }

    return {
      outcome: {
        success,
        notes: actual.userReportedIssue,
      },
      experience,
      safety: {
        result: safety,
        notes: actual.safetyIncident ? 'CGUS safetyIncident=true' : undefined,
      },
    };
  }

  private mapTravelSuccess(success: string): OutcomeSuccess {
    const s = success.toLowerCase();
    if (s === 'excellent' || s === 'good') return 'SUCCESS';
    if (s === 'acceptable') return 'PARTIAL';
    if (s === 'poor' || s === 'failed') return 'FAILURE';
    return 'UNKNOWN';
  }
}
