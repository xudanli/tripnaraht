// src/trips/readiness/dto/checklist-status.dto.ts
import { IsArray, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 批量保存勾选状态请求 DTO
 */
export class UpdateChecklistStatusDto {
  @ApiProperty({
    description: '已勾选的 finding item ID 列表',
    example: ['must-item-1', 'must-item-2', 'must-item-5'],
    type: [String],
  })
  @IsArray()
  checkedItems!: string[];
}

/**
 * 批量保存勾选状态响应 DTO
 */
export class ChecklistStatusResponseDto {
  @ApiProperty({ description: '更新的项数量', example: 3 })
  updated!: number;

  @ApiProperty({
    description: '当前已勾选的项列表',
    example: ['must-item-1', 'must-item-2', 'must-item-5'],
    type: [String],
  })
  checkedItems!: string[];
}

/**
 * 获取勾选状态响应 DTO
 */
export class GetChecklistStatusResponseDto {
  @ApiProperty({
    description: '已勾选的 finding item ID 列表',
    example: ['must-item-1', 'must-item-2'],
    type: [String],
  })
  checkedItems!: string[];

  @ApiProperty({
    description: '最后更新时间（ISO 8601 格式）',
    example: '2024-01-15T10:30:00Z',
  })
  lastUpdated!: string;
}

