/**
 * Nara Incident Record — 真实 Incident；P0/P1 修复后必须沉淀 Regression。
 * Architecture Freeze, Evidence-driven Fix。
 */

import type { V1JourneyId } from './v1-journey-contract.util';
import type { BetaAllowChangeCategory } from './closed-beta.util';
import {
  createEvidenceDrivenTask,
  type EvidenceDrivenTaskV1,
} from './evidence-driven-fix.util';
import {
  createRealWorldRegressionGolden,
  type RealWorldRegressionGoldenV1,
} from './real-world-regression-golden.util';

export const NARA_INCIDENT_RECORD_SCHEMA =
  'nara.incident_record@v1' as const;

export type NaraIncidentRecordV1 = {
  schemaId: typeof NARA_INCIDENT_RECORD_SCHEMA;
  version: 1;
  incidentId: string;
  tripId: string;
  journeyId?: V1JourneyId;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  category: BetaAllowChangeCategory | 'TASK_FAILURE' | 'OTHER';
  summaryZh: string;
  reproducible: boolean;
  explainable: boolean;
  unauthorizedMutation: boolean;
  harnessBypass: boolean;
  openedAt: string;
  resolvedAt?: string;
  status: 'OPEN' | 'IN_REVIEW' | 'FIXED' | 'REGRESSION_CAPTURED' | 'CLOSED';
  /** P0/P1 必须有 */
  regressionGoldenId?: string;
  architectureFreeze: true;
  evidenceDrivenFix: true;
};

export function openNaraIncident(input: {
  tripId: string;
  summaryZh: string;
  severity: NaraIncidentRecordV1['severity'];
  category: NaraIncidentRecordV1['category'];
  journeyId?: V1JourneyId;
  reproducible?: boolean;
  explainable?: boolean;
  unauthorizedMutation?: boolean;
  harnessBypass?: boolean;
  incidentId?: string;
}): NaraIncidentRecordV1 {
  return {
    schemaId: NARA_INCIDENT_RECORD_SCHEMA,
    version: 1,
    incidentId: input.incidentId ?? `nir_${input.tripId}_${Date.now()}`,
    tripId: input.tripId,
    journeyId: input.journeyId,
    severity: input.severity,
    category: input.category,
    summaryZh: input.summaryZh,
    reproducible: input.reproducible ?? true,
    explainable: input.explainable ?? true,
    unauthorizedMutation: !!input.unauthorizedMutation,
    harnessBypass: !!input.harnessBypass,
    openedAt: new Date().toISOString(),
    status: 'OPEN',
    architectureFreeze: true,
    evidenceDrivenFix: true,
  };
}

export type ResolveIncidentResult =
  | {
      ok: true;
      incident: NaraIncidentRecordV1;
      fixTask: EvidenceDrivenTaskV1;
      regression: RealWorldRegressionGoldenV1;
    }
  | {
      ok: false;
      code: 'P0_P1_REQUIRES_REGRESSION';
      reasonZh: string;
      incident: NaraIncidentRecordV1;
    };

/**
 * 修复结案：P0/P1 必须沉淀 Real-world Regression Golden。
 */
export function resolveNaraIncidentWithRegression(input: {
  incident: NaraIncidentRecordV1;
  fixSummaryZh: string;
  regressionGoldenId?: string;
  skipRegression?: boolean;
}): ResolveIncidentResult {
  const needsRegression =
    input.incident.severity === 'P0' || input.incident.severity === 'P1';

  if (needsRegression && input.skipRegression) {
    return {
      ok: false,
      code: 'P0_P1_REQUIRES_REGRESSION',
      reasonZh: '所有真实 P0/P1 Incident 修复后必须沉淀 Regression',
      incident: input.incident,
    };
  }

  const fixSource = ((): EvidenceDrivenTaskV1['source'] => {
    switch (input.incident.category) {
      case 'TASK_FAILURE':
        return 'TASK_FAILURE';
      case 'DATA_QUALITY':
        return 'DATA_QUALITY';
      case 'PERFORMANCE':
        return 'PERFORMANCE';
      case 'STABILITY':
        return 'STABILITY';
      case 'RECOVERY':
        return 'RECOVERY';
      case 'USER_UNDERSTANDING':
        return 'USER_UNDERSTANDING';
      case 'BETA_BLOCKER':
      case 'OTHER':
      default:
        return 'BETA_INCIDENT';
    }
  })();

  const fixTask = createEvidenceDrivenTask({
    source: fixSource,
    evidenceRef: input.incident.incidentId,
    summaryZh: input.fixSummaryZh,
  });

  if (!needsRegression) {
    return {
      ok: true,
      incident: {
        ...input.incident,
        status: 'FIXED',
        resolvedAt: new Date().toISOString(),
      },
      fixTask,
      regression: createRealWorldRegressionGolden({
        goldenId:
          input.regressionGoldenId ??
          `rwg_optional_${input.incident.incidentId}`,
        tripId: input.incident.tripId,
        journeyId: input.incident.journeyId ?? 'QUERY',
        incidentId: input.incident.incidentId,
        titleZh: input.fixSummaryZh,
        mandatory: false,
      }),
    };
  }

  const regression = createRealWorldRegressionGolden({
    goldenId:
      input.regressionGoldenId ?? `rwg_${input.incident.incidentId}`,
    tripId: input.incident.tripId,
    journeyId: input.incident.journeyId ?? 'ADJUST',
    incidentId: input.incident.incidentId,
    titleZh: `Regression from ${input.incident.severity}: ${input.incident.summaryZh}`,
    mandatory: true,
  });

  return {
    ok: true,
    incident: {
      ...input.incident,
      status: 'REGRESSION_CAPTURED',
      resolvedAt: new Date().toISOString(),
      regressionGoldenId: regression.goldenId,
    },
    fixTask,
    regression,
  };
}
