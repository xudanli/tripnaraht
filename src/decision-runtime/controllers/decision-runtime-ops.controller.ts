import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/dto/standard-response.dto';
import { Gate1OpsAccessGuard } from '../../gate1/guards/gate1-ops-access.guard';
import {
  isDecisionRuntimeReadFromProjectionEnabled,
  isGate1LinkedTripAutoCreateEnabled,
  isGate1TripStatusSyncEnabled,
  isRuntimeEventOutboxEnabled,
} from '../decision-runtime.config';
import { isTravelEventStoreEnabled } from '../../trips/event-store/travel-event-store.config';
import { DecisionWorkspaceReconciliationService } from '../services/decision-workspace-reconciliation.service';
import { Gate1RuntimeBackfillService } from '../services/gate1-runtime-backfill.service';
import { Gate1LinkedTripAnchorService } from '../services/gate1-linked-trip-anchor.service';
import { Gate1RuntimeMetricsService } from '../services/gate1-runtime-metrics.service';
import { RuntimeEventOutboxService } from '../services/runtime-event-outbox.service';
import { Gate1RuntimeAcceptanceService } from '../services/gate1-runtime-acceptance.service';
import { DecisionOsSloService } from '../../decision/slo/decision-os-slo.service';
import { DecisionDnaComplianceService } from '../../agent/memory/governance/decision-dna-compliance.service';
import { runContextRecallBaseline } from '../../decision/slo/context-recall-baseline.runner';
import { resolveEffectivePlanWriteChainStatus } from '../execution/effective-plan-write-chain-status.util';
import { getRecentEffectivePlanWriteGuardShadowEvents } from '../execution/effective-plan-write-guard-shadow.util';

@ApiTags('gate1-ops')
@Controller(['ops/runtime', 'decision-runtime/ops'])
@UseGuards(Gate1OpsAccessGuard)
export class DecisionRuntimeOpsController {
  constructor(
    private readonly reconciliation: DecisionWorkspaceReconciliationService,
    private readonly backfill: Gate1RuntimeBackfillService,
    private readonly linkedTripAnchor: Gate1LinkedTripAnchorService,
    private readonly metrics: Gate1RuntimeMetricsService,
    private readonly outbox: RuntimeEventOutboxService,
    private readonly acceptance: Gate1RuntimeAcceptanceService,
    private readonly decisionOsSlo: DecisionOsSloService,
    private readonly dnaCompliance: DecisionDnaComplianceService,
  ) {}

  @Get('flags')
  @ApiOperation({ summary: 'Decision Runtime 功能开关状态' })
  flags() {
    return successResponse({
      travelEventStoreEnabled: isTravelEventStoreEnabled(),
      readFromProjection: isDecisionRuntimeReadFromProjectionEnabled(),
      linkedTripAutoCreate: isGate1LinkedTripAutoCreateEnabled(),
      tripStatusSync: isGate1TripStatusSyncEnabled(),
      runtimeEventOutbox: isRuntimeEventOutboxEnabled(),
      writeChain: resolveEffectivePlanWriteChainStatus(),
    });
  }

  @Get('write-chain')
  @ApiOperation({ summary: 'Phase 5 — Effective Plan 写链状态与授权路径' })
  writeChainStatus() {
    return successResponse(resolveEffectivePlanWriteChainStatus());
  }

  @Get('write-chain/shadow-bypasses')
  @ApiOperation({ summary: 'Phase 1 — EFFECTIVE_PLAN_WRITE_GUARD=SHADOW 近期 bypass 观测' })
  writeChainShadowBypasses(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, parseInt(String(limit ?? '50'), 10) || 50));
    return successResponse(getRecentEffectivePlanWriteGuardShadowEvents(n));
  }

  @Get('slo')
  @ApiOperation({ summary: 'Decision OS SLO 快照（Validation Gateway + Contingency）' })
  getDecisionOsSlo() {
    return successResponse(this.decisionOsSlo.getSnapshot());
  }

  @Get('slo/contingency/recent')
  @ApiOperation({ summary: '混合干预 SLO：快照 + 近期 Contingency 运行记录' })
  getContingencySloRecent(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'), 10) || 20));
    return successResponse({
      snapshot: this.decisionOsSlo.getSnapshot(),
      recentContingency: this.decisionOsSlo.getRecentContingencyRuns(n),
      recentValidation: this.decisionOsSlo.getRecentValidationRuns(Math.min(n, 20)),
    });
  }

  @Get('slo/decision-dna/recent')
  @ApiOperation({ summary: 'Decision DNA 合规审计：近期 sync gate 记录' })
  getDecisionDnaComplianceRecent(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'), 10) || 20));
    return successResponse({
      recentAudits: this.dnaCompliance.getRecentAudits(n),
    });
  }

  @Get('slo/context-recall/baseline')
  @ApiOperation({ summary: '上下文召回 baseline（fixture golden cases）' })
  getContextRecallBaseline() {
    return successResponse(runContextRecallBaseline());
  }

  @Get('slo/memory-state/recent')
  @ApiOperation({ summary: 'MemoryState overlay shadow diff 近期记录' })
  getMemoryStateShadowRecent(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, parseInt(String(limit ?? '20'), 10) || 20));
    return successResponse({
      recentShadow: this.decisionOsSlo.getRecentMemoryStateShadow(n),
    });
  }

  @Get('acceptance')
  @ApiOperation({ summary: 'M2/M3 验收报告（linkedTrip 覆盖率 + 对账 + outbox）' })
  async runAcceptance() {
    return successResponse(await this.acceptance.runAcceptance());
  }

  @Get('outbox/stats')
  @ApiOperation({ summary: 'Runtime Event Outbox 队列统计（Tier 1.2）' })
  async outboxStats() {
    return successResponse({
      enabled: isRuntimeEventOutboxEnabled(),
      ...(await this.outbox.getStats()),
    });
  }

  @Post('outbox/drain')
  @ApiOperation({ summary: '手动 drain PENDING outbox 行 → travel_events' })
  async drainOutbox() {
    return successResponse(await this.outbox.drainPending(200));
  }

  @Get('linked-trip/coverage')
  @ApiOperation({ summary: 'Gate1 linkedTripId 覆盖率（Tier 0.3）' })
  async linkedTripCoverage() {
    return successResponse(await this.linkedTripAnchor.getCoverageReport());
  }

  @Post('linked-trip/backfill-all')
  @ApiOperation({ summary: '为缺失 linkedTripId 的项目补锚点（listing 或自动建 Trip）' })
  async backfillLinkedTrips() {
    const results = await this.linkedTripAnchor.backfillAllMissing();
    return successResponse({
      total: results.length,
      linkedFromListing: results.filter((r) => r.action === 'linked_from_listing').length,
      createdTrip: results.filter((r) => r.action === 'created_trip').length,
      failed: results.filter((r) => r.action === 'failed').length,
      results,
    });
  }

  @Post('projects/:projectId/link-trip')
  @ApiOperation({ summary: '单项目补 linkedTripId' })
  async backfillLinkedTrip(@Param('projectId') projectId: string) {
    return successResponse(await this.linkedTripAnchor.backfillProject(projectId));
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Runtime 指标 v0（Tier 1.4）' })
  async getMetrics(@Query('reconcile') reconcile?: string) {
    const includeReconcile = reconcile === 'true' || reconcile === '1';
    return successResponse(await this.metrics.getMetricsV0(includeReconcile));
  }

  @Get('projects/:projectId/audit-timeline')
  @ApiOperation({ summary: '审计时间线投影（Tier 2.4）' })
  async auditTimeline(@Param('projectId') projectId: string) {
    return successResponse(await this.reconciliation.getAuditTimeline(projectId));
  }

  @Get('projects/reconcile-all')
  @ApiOperation({ summary: '全部已关联 Trip 的 Gate1 项目对账' })
  async reconcileAll() {
    const results = await this.reconciliation.reconcileAllLinkedProjects();
    return successResponse({
      total: results.length,
      matched: results.filter((r) => r.allMatched).length,
      skipped: results.filter((r) => r.skippedReason).length,
      mismatched: results.filter((r) => !r.allMatched && !r.skippedReason).length,
      results,
    });
  }

  @Get('projects/:projectId/reconcile')
  @ApiOperation({ summary: '影子投影对账：Gate1 表 vs Event Store' })
  async reconcileProject(@Param('projectId') projectId: string) {
    return successResponse(await this.reconciliation.reconcileProject(projectId));
  }

  @Get('projects/:projectId/projection')
  @ApiOperation({ summary: '从 Event Store 重建 decision_workspace 投影' })
  async getProjection(@Param('projectId') projectId: string) {
    const report = await this.reconciliation.reconcileProject(projectId);
    return successResponse({
      readFromProjectionFlag: isDecisionRuntimeReadFromProjectionEnabled(),
      projection: report.projection,
      gate1ProjectId: report.projectId,
      tripId: report.tripId,
      skippedReason: report.skippedReason,
    });
  }

  @Post('projects/:projectId/backfill')
  @ApiOperation({ summary: '回填 Gate1 历史事实到 Event Store（幂等）' })
  async backfillProject(@Param('projectId') projectId: string) {
    return successResponse(await this.backfill.backfillProject(projectId));
  }

  @Post('backfill-all')
  @ApiOperation({ summary: '回填全部已关联 Trip 的 Gate1 项目' })
  async backfillAll() {
    const results = await this.backfill.backfillAllLinked();
    return successResponse({
      total: results.length,
      totalPersisted: results.reduce((s, r) => s + r.persisted, 0),
      skippedNoTrip: results.filter((r) => r.skippedNoTrip).length,
      results,
    });
  }
}
