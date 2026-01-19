// src/trips/readiness/dto/admin-pack.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsBoolean, IsObject } from 'class-validator';
import { ReadinessPack } from '../types/readiness-pack.types';

export class GetReadinessPacksQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '国家代码筛选' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '目的地ID筛选' })
  @IsOptional()
  @IsString()
  destinationId?: string;

  @ApiPropertyOptional({ description: '是否激活' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '搜索关键词（packId、displayName）' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ReadinessPackListItemDto {
  @ApiProperty({ description: 'Pack ID' })
  id!: string;

  @ApiProperty({ description: 'Pack标识符' })
  packId!: string;

  @ApiProperty({ description: '目的地ID' })
  destinationId!: string;

  @ApiProperty({ description: '显示名称（默认）' })
  displayName!: string;

  @ApiPropertyOptional({ description: '显示名称（英文）' })
  displayNameEN?: string;

  @ApiPropertyOptional({ description: '显示名称（中文）' })
  displayNameCN?: string;

  @ApiProperty({ description: '版本号' })
  version!: string;

  @ApiProperty({ description: '最后审核时间' })
  lastReviewedAt!: Date;

  @ApiProperty({ description: '国家代码' })
  countryCode!: string;

  @ApiPropertyOptional({ description: '区域（默认）' })
  region?: string;

  @ApiPropertyOptional({ description: '区域（英文）' })
  regionEN?: string;

  @ApiPropertyOptional({ description: '区域（中文）' })
  regionCN?: string;

  @ApiPropertyOptional({ description: '城市（默认）' })
  city?: string;

  @ApiPropertyOptional({ description: '城市（英文）' })
  cityEN?: string;

  @ApiPropertyOptional({ description: '城市（中文）' })
  cityCN?: string;

  @ApiProperty({ description: '是否激活' })
  isActive!: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export class ReadinessPackListResponseDto {
  @ApiProperty({ description: 'Pack列表', type: [ReadinessPackListItemDto] })
  packs!: ReadinessPackListItemDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiProperty({ description: '页码' })
  page!: number;

  @ApiProperty({ description: '每页数量' })
  limit!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}

export class CreateReadinessPackDto {
  @ApiProperty({ description: 'Pack数据', type: Object })
  @IsObject()
  pack!: ReadinessPack;
}

export class UpdateReadinessPackDto {
  @ApiPropertyOptional({ description: 'Pack数据', type: Object })
  @IsOptional()
  @IsObject()
  pack?: ReadinessPack;

  @ApiPropertyOptional({ description: '是否激活' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
