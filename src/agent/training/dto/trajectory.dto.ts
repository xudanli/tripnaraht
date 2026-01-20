// src/agent/training/dto/trajectory.dto.ts

import { IsString, IsOptional, IsObject, IsArray, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Itinerary, DecisionLogEntry, GateResult } from '../../interfaces/trip-plan.interface';
import { ComplianceResult } from '../interfaces/trajectory.interface';

/**
 * 轨迹收集请求DTO
 */
export class CollectTrajectoryDto {
  @ApiProperty({ description: '请求ID' })
  @IsString()
  requestId: string;

  @ApiPropertyOptional({ description: '行程ID' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiProperty({ description: '生成的计划' })
  @IsObject()
  plan: Itinerary;

  @ApiProperty({ description: '决策链' })
  @IsArray()
  decisionTrace: DecisionLogEntry[];

  @ApiProperty({ description: '研究数据' })
  @IsObject()
  researchData: Record<string, any>;

  @ApiProperty({ description: 'Gate评估结果' })
  @IsObject()
  gateResult: GateResult;

  @ApiProperty({ description: 'Compliance评估结果' })
  @IsObject()
  complianceResult: ComplianceResult;

  @ApiPropertyOptional({ description: '模型版本', default: 'v1.0' })
  @IsOptional()
  @IsString()
  modelVersion?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

/**
 * 轨迹验证请求DTO
 */
export class ValidateTrajectoryDto {
  @ApiPropertyOptional({ description: 'Gate评估结果（如果为空，从数据库读取）' })
  @IsOptional()
  @IsObject()
  gateResult?: GateResult;

  @ApiPropertyOptional({ description: 'Compliance评估结果（如果为空，从数据库读取）' })
  @IsOptional()
  @IsObject()
  complianceResult?: ComplianceResult;

  @ApiPropertyOptional({ description: '用户审批状态' })
  @IsOptional()
  @IsString()
  userApproval?: 'APPROVED' | 'REJECTED' | 'PENDING';

  @ApiPropertyOptional({ description: '执行结果' })
  @IsOptional()
  @IsObject()
  executionResult?: {
    success: boolean;
    error?: string;
  };
}

/**
 * 轨迹收集响应DTO
 */
export class CollectTrajectoryResponseDto {
  @ApiProperty({ description: '轨迹ID' })
  trajectoryId: string;

  @ApiProperty({ description: '状态' })
  status: string;

  @ApiPropertyOptional({ description: '验证分数' })
  validationScore?: number;
}

/**
 * 轨迹验证响应DTO
 */
export class ValidateTrajectoryResponseDto {
  @ApiProperty({ description: '是否有效' })
  isValid: boolean;

  @ApiProperty({ description: '验证分数（0-1）' })
  score: number;

  @ApiProperty({ description: '验证原因' })
  reasons: string[];

  @ApiProperty({ description: '验证状态' })
  validationStatus: 'VALIDATED' | 'REJECTED';
}
