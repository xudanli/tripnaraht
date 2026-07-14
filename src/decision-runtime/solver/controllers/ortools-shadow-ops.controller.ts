/**
 * OR-Tools shadow metrics ops (ADR-008).
 * Enable: OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED=1 (default on unless metrics disabled)
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../../common/dto/standard-response.dto';
import { OrToolsShadowMetricsCollector } from '../observability/ortools-shadow-metrics.collector';
import {
  isOrToolsAuthoritativeCanaryFlagOn,
  isOrToolsMoveDayShadowEnabled,
  isOrToolsNativeCpSatEnabled,
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../ortools-solver.config';
import { SOLVER_MVP_OPERATIONS } from '../contracts/solver-problem';
import {
  evaluateOrToolsShadowMetricsGate,
  foldLabSignoffChecks,
} from '../lab/ortools-lab-signoff.gate';
import {
  evaluateOrtToolsAuthorityCanaryGate,
  resolveAuthoritativeRepairProviderId,
} from '../lab/ortools-authority-canary.gate';
import { resolveCanaryStage } from '../lab/planning-signoff/selected-trips-canary';
import { loadSelectedTripsWhitelist } from '../lab/planning-signoff/selected-trips-canary';
import {
  OrToolsCanaryDashboardCollector,
} from '../observability/ortools-canary-dashboard.metrics';

export function isOrToolsShadowObservabilityEnabled(): boolean {
  const raw = process.env.OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return process.env.OR_TOOLS_SHADOW_METRICS_DISABLED !== '1';
}

@ApiTags('decision-engine')
@Controller('decision-engine/v1/ortools-shadow')
export class OrToolsShadowOpsController {
  constructor(
    @Optional() private readonly metrics?: OrToolsShadowMetricsCollector,
    @Optional() private readonly canaryDashboard?: OrToolsCanaryDashboardCollector,
  ) {}

  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OR-Tools shadow wiring status (non-authoritative)' })
  health() {
    return successResponse({
      shadowObservabilityEnabled: isOrToolsShadowObservabilityEnabled(),
      shadowRepairEnabled: isOrToolsRepairShadowEnabled(),
      moveDayShadowEnabled: isOrToolsMoveDayShadowEnabled(),
      nativeCpSatEnabled: isOrToolsNativeCpSatEnabled(),
      authoritativeCanaryFlag: isOrToolsAuthoritativeCanaryFlagOn(),
      canaryStage: resolveCanaryStage(),
      selectedTripsWhitelistCount:
        loadSelectedTripsWhitelist()?.tripIds?.length ?? 0,
      solverUrlConfigured: resolveOrToolsSolverBaseUrl() != null,
      solverBaseUrl: resolveOrToolsSolverBaseUrl(),
      mvpOperations: [...SOLVER_MVP_OPERATIONS],
      authority: 'neptune-repair|legacy-optimize-route|legacy-frozen',
      shadowProviderId: 'ortools-repair',
      /** Default wire claim; SHIFT may return nativeCpSat=true only with OR_TOOLS_CP_SAT */
      nativeCpSat: false,
      writeAuthority: false,
      /** ADR-008 S4 — attached on PlanProposal.ortoolsShadow, never apply */
      planningOrchestratorShadow: {
        intents: ['OPTIMIZE_ROUTE', 'AUTO_ARRANGE'],
        attachmentField: 'ortoolsShadow',
        shadowAuthority: false,
      },
      /** P2 Evidence stale main-chain */
      evidenceStaleMainChain: {
        discardPriorOnDrift: true,
        resolver: 'selectUsableOrtToolsEvaluateShadow',
        metricsField: 'staleDiscardTotal',
      },
    });
  }

  @Public()
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OR-Tools vs Neptune shadow metrics snapshot' })
  metricsSnapshot(@Query('limit') limit?: string) {
    if (!isOrToolsShadowObservabilityEnabled()) {
      return errorResponse(
        ErrorCode.BUSINESS_ERROR,
        'OR-Tools shadow observability disabled',
      );
    }
    if (!this.metrics) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'OrToolsShadowMetricsCollector unavailable',
      );
    }
    const snap = this.metrics.snapshot();
    const n = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return successResponse({
      ...snap,
      recent: snap.recent.slice(0, n),
    });
  }

  @Public()
  @Get('planning-lab/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recent legacy vs OR-Tools OPTIMIZE_ROUTE Lab compares (does NOT promote authority)',
  })
  planningLabCompare(@Query('limit') limit?: string) {
    if (!isOrToolsShadowObservabilityEnabled()) {
      return errorResponse(
        ErrorCode.BUSINESS_ERROR,
        'OR-Tools shadow observability disabled',
      );
    }
    if (!this.metrics) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'OrToolsShadowMetricsCollector unavailable',
      );
    }
    const snap = this.metrics.snapshot();
    const n = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return successResponse({
      schemaId: 'tripnara.ortools_planning_lab_compare_rollups@v1',
      authoritativePromotion: false,
      planningLabCompareTotal: snap.planningLabCompareTotal,
      planningLabShadowCheaperTotal: snap.planningLabShadowCheaperTotal,
      planningLabMeanAgreement: snap.planningLabMeanAgreement,
      recent: snap.recentPlanningLab.slice(0, n),
      note: 'Attached on PlanProposal.ortoolsShadow.labCompare; apply still uses legacy changes',
    });
  }

  @Public()
  @Get('authority/gate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'M4 Release Authorization Gate checklist (engineering READY ≠ authorized; no Plan Version write)',
  })
  authorityGate() {
    const snap = this.metrics?.snapshot();
    const report = evaluateOrtToolsAuthorityCanaryGate({
      writeAttemptedTotal: snap?.writeAttemptedTotal ?? 0,
      forbiddenEdgeViolationSum: snap?.forbiddenEdgeViolationSum ?? 0,
      runsTotal: snap?.runsTotal ?? 0,
    });
    return successResponse({
      ...report,
      authoritativeRepairProviderId:
        resolveAuthoritativeRepairProviderId(report),
      pilot: 'M4-RA-01',
      note: 'See solver/M4_RA_01_SELECTED_TRIPS_PILOT.md — scope + token + selected_trips',
    });
  }

  @Public()
  @Get('canary/dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'M4 canary authorization-chain dashboard (zeros + provider roles; not solver score)',
  })
  canaryDashboardView() {
    if (!this.canaryDashboard) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'OrToolsCanaryDashboardCollector unavailable',
      );
    }
    const snap = this.canaryDashboard.snapshot();
    return successResponse({
      ...snap,
      safetyIncident: this.canaryDashboard.hasSafetyIncident(snap),
      canaryStage: resolveCanaryStage(),
      note: 'Evaluate main-chain records via wireOrtToolsEvaluateCanary',
    });
  }

  @Public()
  @Get('lab-signoff/gate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Nest-side Lab Sign-off gate on shadow metrics (does NOT promote authority)',
  })
  labSignoffGate() {
    if (!this.metrics) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        'OrToolsShadowMetricsCollector unavailable',
      );
    }
    const snap = this.metrics.snapshot();
    const report = foldLabSignoffChecks(
      evaluateOrToolsShadowMetricsGate({
        writeAttemptedTotal: snap.writeAttemptedTotal,
        forbiddenEdgeViolationSum: snap.forbiddenEdgeViolationSum,
        runsTotal: snap.runsTotal,
      }),
    );
    return successResponse({
      ...report,
      note: 'Python solver latency/seed benches: python/solver/lab_signoff.py',
      metricsRunsTotal: snap.runsTotal,
    });
  }
}
