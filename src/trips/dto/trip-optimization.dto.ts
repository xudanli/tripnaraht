// src/trips/dto/trip-optimization.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 优化结果应用选项
 */
export class ApplyOptimizationOptionsDto {
  @ApiPropertyOptional({ description: '是否替换现有行程项', default: true })
  @IsOptional()
  replaceExisting?: boolean;

  @ApiPropertyOptional({ description: '是否保留手动编辑的项', default: true })
  @IsOptional()
  preserveManualEdits?: boolean;

  @ApiPropertyOptional({ description: '是否只是预览，不实际应用', default: false })
  @IsOptional()
  dryRun?: boolean;

  @ApiPropertyOptional({ description: '仅应用到指定行程日 ID（TripDay.id），用于单日优化场景' })
  @IsOptional()
  dayId?: string;
}

/**
 * 应用优化结果请求 DTO
 */
export class ApplyOptimizationRequestDto {
  @ApiPropertyOptional({ description: '优化结果 ID' })
  @IsOptional()
  optimizationId?: string;

  @ApiProperty({ 
    description: '优化结果数据（OptimizeRouteResponse 类型）',
    example: { route: [], timeline: [] }
  })
  @IsNotEmpty({ message: '优化结果数据不能为空' })
  @IsObject({ message: '优化结果数据必须是对象' })
  result: any; // OptimizeRouteResponse 类型

  @ApiPropertyOptional({ description: '应用选项', type: ApplyOptimizationOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApplyOptimizationOptionsDto)
  options?: ApplyOptimizationOptionsDto;
}

/**
 * 变更预览
 */
export class ChangePreviewDto {
  @ApiProperty({ description: '日期 ID' })
  dayId: string;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  date: string;

  @ApiProperty({ description: '新增项数量' })
  added: number;

  @ApiProperty({ description: '删除项数量' })
  removed: number;

  @ApiProperty({ description: '修改项数量' })
  modified: number;
}

/**
 * 应用优化结果响应 DTO
 */
export class ApplyOptimizationResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '应用的行程项数量' })
  appliedItems: number;

  @ApiProperty({ description: '修改的日期数组', type: [String] })
  modifiedDays: string[];

  @ApiPropertyOptional({ description: '预览数据（如果 dryRun=true）', type: [ChangePreviewDto] })
  preview?: ChangePreviewDto[];

  @ApiPropertyOptional({
    description: '因不营业等原因未能创建的行程项',
    type: 'array',
    items: { type: 'object', properties: { placeId: { type: 'number' }, reason: { type: 'string' } } },
  })
  skipped?: Array<{ placeId: number; reason: string }>;
}

