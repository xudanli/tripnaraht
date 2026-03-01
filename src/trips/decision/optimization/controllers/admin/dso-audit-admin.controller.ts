// src/trips/decision/optimization/controllers/admin/dso-audit-admin.controller.ts
/**
 * 管理端 - DSO 快照审计 API
 * 
 * 提供 DSO 状态快照查询、差异分析、回滚功能
 * 用于调试、审计和系统恢复
 */

import { Controller, Get, Post, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';

import {
  DSOSnapshotAuditService,
  SnapshotQueryFilter,
  SnapshotQueryResult,
  StateDiff,
  LyapunovTrace,
} from '../../learning/dso-snapshot-audit.service';

// ========== Request DTOs ==========

export class QuerySnapshotsDto {
  @ApiPropertyOptional({ description: '请求 ID', example: 'req-12345' })
  requestId?: string;

  @ApiPropertyOptional({ description: '决策阶段', example: 'PLAN_GEN', enum: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'OPTIMIZE', 'VERIFY', 'NARRATE', 'DONE'] })
  phase?: string;

  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)', example: '2026-03-01T00:00:00Z' })
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)', example: '2026-03-01T23:59:59Z' })
  endTime?: string;

  @ApiPropertyOptional({ description: '最小版本号', example: 1 })
  minVersion?: number;

  @ApiPropertyOptional({ description: '最大版本号', example: 100 })
  maxVersion?: number;

  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  page?: number;

  @ApiPropertyOptional({ description: '每页数量', example: 20, default: 20 })
  pageSize?: number;
}

export class ComputeDiffDto {
  @ApiProperty({ description: '请求 ID', example: 'req-12345' })
  requestId!: string;

  @ApiProperty({ description: '起始版本号', example: 1 })
  fromVersion!: number;

  @ApiProperty({ description: '目标版本号', example: 5 })
  toVersion!: number;
}

export class RollbackDto {
  @ApiProperty({ description: '请求 ID', example: 'req-12345' })
  requestId!: string;

  @ApiProperty({ description: '目标版本号', example: 3 })
  targetVersion!: number;

  @ApiPropertyOptional({ description: '回滚原因', example: '检测到异常状态' })
  reason?: string;

  @ApiPropertyOptional({ description: '操作者 ID', example: 'admin-001' })
  operatorId?: string;
}

export class CleanupDto {
  @ApiProperty({ description: '请求 ID', example: 'req-12345' })
  requestId!: string;

  @ApiPropertyOptional({ description: '保留的版本数量', example: 50, default: 50 })
  keepVersions?: number;
}

// ========== Response Types ==========

export class SnapshotSummaryResponse {
  @ApiProperty({ description: '快照 ID', example: 'uuid-1234' })
  id!: string;

  @ApiProperty({ description: '请求 ID', example: 'req-12345' })
  requestId!: string;

  @ApiProperty({ description: '版本号', example: 5 })
  version!: number;

  @ApiProperty({ description: '决策阶段', example: 'PLAN_GEN' })
  phase!: string;

  @ApiPropertyOptional({ description: '置信度 (0-1)', example: 0.85 })
  confidence!: number | null;

  @ApiPropertyOptional({ description: 'Lyapunov 函数值', example: 0.32 })
  lyapunovValue!: number | null;

  @ApiProperty({ description: '创建时间', example: '2026-03-01T12:00:00Z' })
  createdAt!: string;
}

export class DiffItemResponse {
  @ApiProperty({ description: '变更字段路径', example: 'userIntent.days' })
  field!: string;

  @ApiProperty({ description: '变更前的值' })
  before!: unknown;

  @ApiProperty({ description: '变更后的值' })
  after!: unknown;

  @ApiProperty({ description: '变更类型', enum: ['ADDED', 'REMOVED', 'MODIFIED'] })
  changeType!: 'ADDED' | 'REMOVED' | 'MODIFIED';
}

export class DiffResponse {
  @ApiProperty({ description: '请求 ID' })
  requestId!: string;

  @ApiProperty({ description: '起始版本' })
  fromVersion!: number;

  @ApiProperty({ description: '目标版本' })
  toVersion!: number;

  @ApiProperty({ description: '差异列表', type: [DiffItemResponse] })
  diffs!: StateDiff[];

  @ApiProperty({ description: '总变更数' })
  totalChanges!: number;
}

export class RollbackResponse {
  @ApiProperty({ description: '是否成功' })
  success!: boolean;

  @ApiProperty({ description: '请求 ID' })
  requestId!: string;

  @ApiProperty({ description: '目标版本' })
  targetVersion!: number;

  @ApiPropertyOptional({ description: '回滚后的新版本号' })
  newVersion?: number;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;
}

export class LyapunovValueItem {
  @ApiProperty({ description: '版本号' })
  version!: number;

  @ApiProperty({ description: '决策阶段' })
  phase!: string;

  @ApiProperty({ description: 'Lyapunov 值' })
  lyapunovValue!: number;

  @ApiProperty({ description: '时间戳' })
  timestamp!: string;
}

export class StabilityAnalysisResponse {
  @ApiProperty({ description: '请求 ID' })
  requestId!: string;

  @ApiProperty({ description: 'Lyapunov 追踪数据' })
  lyapunovTrace!: LyapunovTrace;

  @ApiProperty({ description: '系统是否稳定' })
  isStable!: boolean;

  @ApiPropertyOptional({ description: '收敛速率' })
  convergenceRate?: number;

  @ApiProperty({ description: '建议', example: '系统稳定，Lyapunov 函数单调递减' })
  recommendation!: string;
}

// Legacy interface aliases
export type SnapshotSummary = SnapshotSummaryResponse;

@ApiTags('Admin - DSO Audit')
@ApiBearerAuth()
@Controller('api/v2/admin/dso-audit')
export class DSOAuditAdminController {
  private readonly logger = new Logger(DSOAuditAdminController.name);

  constructor(
    private readonly auditService: DSOSnapshotAuditService,
  ) {}

  @Public()
  @Get('snapshots')
  @ApiOperation({ summary: '查询 DSO 快照' })
  @ApiQuery({ name: 'requestId', required: false, description: '请求 ID' })
  @ApiQuery({ name: 'phase', required: false, description: '决策阶段' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: '快照列表' })
  async querySnapshots(
    @Query() query: QuerySnapshotsDto,
  ): Promise<SnapshotQueryResult> {
    this.logger.debug(`[DSOAudit] 查询快照: ${JSON.stringify(query)}`);

    const filter: SnapshotQueryFilter = {
      requestId: query.requestId,
      phase: query.phase,
      startTime: query.startTime ? new Date(query.startTime) : undefined,
      endTime: query.endTime ? new Date(query.endTime) : undefined,
      minVersion: query.minVersion,
      maxVersion: query.maxVersion,
    };

    return this.auditService.querySnapshots(
      filter,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Public()
  @Get('snapshots/:requestId/latest')
  @ApiOperation({ summary: '获取最新快照' })
  @ApiParam({ name: 'requestId', description: '请求 ID' })
  @ApiResponse({ status: 200, description: '最新快照' })
  async getLatestSnapshot(
    @Param('requestId') requestId: string,
  ): Promise<SnapshotSummary | null> {
    const snapshot = await this.auditService.getLatestSnapshot(requestId);
    
    if (!snapshot) return null;
    
    return {
      id: snapshot.id,
      requestId: snapshot.requestId,
      version: snapshot.version,
      phase: snapshot.phase,
      confidence: snapshot.confidence,
      lyapunovValue: snapshot.lyapunovValue,
      createdAt: snapshot.createdAt.toISOString(),
    };
  }

  @Public()
  @Get('snapshots/:requestId/:version')
  @ApiOperation({ summary: '获取指定版本快照' })
  @ApiParam({ name: 'requestId', description: '请求 ID' })
  @ApiParam({ name: 'version', description: '版本号' })
  @ApiResponse({ status: 200, description: '快照详情' })
  async getSnapshotByVersion(
    @Param('requestId') requestId: string,
    @Param('version') version: number,
  ) {
    return this.auditService.getSnapshotByVersion(requestId, Number(version));
  }

  @Public()
  @Get('snapshots/:requestId/history')
  @ApiOperation({ summary: '获取状态变更历史' })
  @ApiParam({ name: 'requestId', description: '请求 ID' })
  @ApiResponse({ status: 200, description: '历史快照列表' })
  async getStateHistory(
    @Param('requestId') requestId: string,
  ): Promise<SnapshotSummary[]> {
    const history = await this.auditService.getStateHistory(requestId);
    
    return history.map(s => ({
      id: s.id,
      requestId: s.requestId,
      version: s.version,
      phase: s.phase,
      confidence: s.confidence,
      lyapunovValue: s.lyapunovValue,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  @Public()
  @Post('diff')
  @ApiOperation({ summary: '计算版本差异' })
  @ApiResponse({ status: 200, description: '状态差异' })
  async computeDiff(
    @Body() dto: ComputeDiffDto,
  ): Promise<DiffResponse> {
    const diffs = await this.auditService.computeDiff(
      dto.requestId,
      dto.fromVersion,
      dto.toVersion,
    );

    return {
      requestId: dto.requestId,
      fromVersion: dto.fromVersion,
      toVersion: dto.toVersion,
      diffs,
      totalChanges: diffs.length,
    };
  }

  @Public()
  @Get('stability/:requestId')
  @ApiOperation({ summary: '获取 Lyapunov 稳定性分析' })
  @ApiParam({ name: 'requestId', description: '请求 ID' })
  @ApiResponse({ status: 200, description: '稳定性分析结果' })
  async getStabilityAnalysis(
    @Param('requestId') requestId: string,
  ): Promise<StabilityAnalysisResponse> {
    const trace = await this.auditService.getLyapunovTrace(requestId);

    let recommendation: string;
    if (trace.values.length === 0) {
      recommendation = '无足够数据进行稳定性分析';
    } else if (trace.isDecreasing) {
      recommendation = '系统稳定，Lyapunov 函数单调递减';
    } else {
      recommendation = '警告：检测到 Lyapunov 函数非单调，可能存在稳定性问题';
    }

    return {
      requestId,
      lyapunovTrace: trace,
      isStable: trace.isDecreasing,
      convergenceRate: trace.convergenceRate,
      recommendation,
    };
  }

  @Post('rollback')
  @ApiOperation({ summary: '回滚到指定版本' })
  @ApiResponse({ status: 200, description: '回滚结果' })
  async rollback(
    @Body() dto: RollbackDto,
  ): Promise<RollbackResponse> {
    this.logger.log(`[DSOAudit] 执行回滚: requestId=${dto.requestId}, targetVersion=${dto.targetVersion}`);

    try {
      const result = await this.auditService.rollback(dto.requestId, dto.targetVersion);

      if (!result) {
        return {
          success: false,
          requestId: dto.requestId,
          targetVersion: dto.targetVersion,
          error: '目标版本不存在',
        };
      }

      const latest = await this.auditService.getLatestSnapshot(dto.requestId);

      return {
        success: true,
        requestId: dto.requestId,
        targetVersion: dto.targetVersion,
        newVersion: latest?.version,
      };
    } catch (error) {
      return {
        success: false,
        requestId: dto.requestId,
        targetVersion: dto.targetVersion,
        error: (error as Error).message,
      };
    }
  }

  @Post('cleanup')
  @ApiOperation({ summary: '清理旧快照' })
  @ApiResponse({ status: 200, description: '清理结果' })
  async cleanup(
    @Body() dto: CleanupDto,
  ): Promise<{ requestId: string; removedCount: number }> {
    const removedCount = await this.auditService.cleanup(
      dto.requestId,
      dto.keepVersions ?? 50,
    );

    this.logger.log(`[DSOAudit] 清理完成: requestId=${dto.requestId}, removed=${removedCount}`);

    return { requestId: dto.requestId, removedCount };
  }
}
