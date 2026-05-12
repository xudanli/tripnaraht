import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { WorldFactResolverService } from './world-fact-resolver.service';
import { PolicySelectionLogService } from './policy-selection-log.service';

/**
 * Debug / Explainability：事实链路与新鲜度（上线前应鉴权 + 限流）。
 */
@ApiTags('world-facts')
@Public()
@Controller('world-facts')
export class WorldFactsController {
  constructor(
    private readonly resolver: WorldFactResolverService,
    private readonly policySelectionLog: PolicySelectionLogService,
  ) {}

  @Get('key/:factKey/history')
  @ApiOperation({
    summary: '按 factKey 查看事实版本链（含 freshness；不含 Gate/Planner）',
  })
  async historyByFactKey(
    @Param('factKey') factKey: string,
    @Query('limit') limitStr?: string,
  ) {
    const parsed = parseInt(limitStr || '50', 10);
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const decodedKey = decodeURIComponent(factKey);
    const chain = await this.resolver.historyByFactKey(decodedKey, limit);
    return successResponse({
      factKey: decodedKey,
      count: chain.length,
      facts: chain.map(({ fact, freshness }) => ({
        id: fact.id,
        factKey: fact.factKey,
        subjectType: fact.subjectType,
        subjectId: fact.subjectId,
        predicate: fact.predicate,
        valueJson: fact.valueJson,
        confidence: fact.confidence,
        sourceType: fact.sourceType,
        sourceRef: fact.sourceRef,
        snapshotVersion: fact.snapshotVersion,
        supersedesFactId: fact.supersedesFactId,
        createdAt: fact.createdAt.toISOString(),
        observedAt: fact.observedAt?.toISOString() ?? null,
        validFrom: fact.validFrom?.toISOString() ?? null,
        validTo: fact.validTo?.toISOString() ?? null,
        freshness,
      })),
    });
  }

  @Get('key/:factKey/latest')
  @ApiOperation({ summary: '按 factKey 解析当前链头（Resolver 统一读取）' })
  async latestByFactKey(@Param('factKey') factKey: string) {
    const decodedKey = decodeURIComponent(factKey);
    const resolved = await this.resolver.resolveLatestByFactKey(decodedKey);
    if (!resolved) {
      return successResponse({ factKey: decodedKey, resolved: null });
    }
    const { fact, freshness } = resolved;
    return successResponse({
      factKey: decodedKey,
      resolved: {
        id: fact.id,
        valueJson: fact.valueJson,
        confidence: fact.confidence,
        sourceType: fact.sourceType,
        sourceRef: fact.sourceRef,
        snapshotVersion: fact.snapshotVersion,
        supersedesFactId: fact.supersedesFactId,
        createdAt: fact.createdAt.toISOString(),
        freshness,
      },
    });
  }

  @Get('policy-selection/logs')
  @ApiOperation({ summary: '按 tripId 查询最近策略选择日志（需 POLICY_SELECTION_LOG_ENABLED 写入）' })
  async policySelectionLogsByTrip(
    @Query('tripId') tripId?: string,
    @Query('limit') limitStr?: string,
  ) {
    const parsed = parseInt(limitStr || '20', 10);
    const limit = Number.isFinite(parsed) ? parsed : 20;
    if (!tripId?.trim()) {
      return successResponse({ tripId: null, logs: [], message: 'tripId query required' });
    }
    const logs = await this.policySelectionLog.findRecentByTripId(tripId.trim(), limit);
    return successResponse({
      tripId: tripId.trim(),
      count: logs.length,
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  }

  @Get('policy-selection/logs/:id')
  @ApiOperation({ summary: '按 id 读取策略选择日志（回放 / 审计）' })
  async policySelectionLogById(@Param('id') id: string) {
    const log = await this.policySelectionLog.findById(id);
    if (!log) {
      return successResponse({ id, log: null });
    }
    return successResponse({
      log: {
        ...log,
        createdAt: log.createdAt.toISOString(),
      },
    });
  }
}
