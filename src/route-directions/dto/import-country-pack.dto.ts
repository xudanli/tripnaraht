// src/route-directions/dto/import-country-pack.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRouteDirectionDto } from './create-route-direction.dto';

/**
 * Country Pack 导入请求 DTO
 * 对应 CountryPackSkeleton 结构
 */
export class ImportCountryPackDto {
  @ApiProperty({
    description: '国家代码',
    example: 'IS',
  })
  @IsString()
  countryCode!: string;

  @ApiProperty({
    description: '国家名称',
    example: 'Iceland',
  })
  @IsString()
  countryName!: string;

  @ApiPropertyOptional({
    description: '国家中文名称',
    example: '冰岛',
  })
  @IsOptional()
  @IsString()
  countryNameCN?: string;

  @ApiProperty({
    description: '路线方向列表',
    type: [CreateRouteDirectionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteDirectionDto)
  routeDirections!: CreateRouteDirectionDto[];

  @ApiPropertyOptional({
    description: '区域列表',
    type: [String],
    example: ['IS_CAPITAL', 'IS_MAJOR_CITY_1'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @ApiPropertyOptional({
    description: '默认策略配置',
    example: {
      defaultPace: 'BALANCED',
      defaultRiskTolerance: 'medium',
    },
  })
  @IsOptional()
  policy?: {
    defaultPace?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
    defaultRiskTolerance?: 'low' | 'medium' | 'high';
  };
}

/**
 * 导入结果响应 DTO
 */
export class ImportCountryPackResultDto {
  @ApiProperty({
    description: '国家代码',
    example: 'IS',
  })
  countryCode!: string;

  @ApiProperty({
    description: '成功导入的路线方向数量',
    example: 3,
  })
  successCount!: number;

  @ApiProperty({
    description: '失败的路线方向数量',
    example: 0,
  })
  failedCount!: number;

  @ApiProperty({
    description: '导入的路线方向详情',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        success: { type: 'boolean' },
        id: { type: 'number', nullable: true },
        error: { type: 'string', nullable: true },
      },
    },
  })
  results!: Array<{
    name: string;
    success: boolean;
    id?: number;
    error?: string;
  }>;
}
