import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoutePackingChecklistDto {
  @ApiPropertyOptional({ description: '国家码，如 CN / IS' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  countryCode?: string;

  @ApiPropertyOptional({ description: '中文名' })
  @IsOptional()
  @IsString()
  nameCN?: string;

  @ApiPropertyOptional({ description: '英文名' })
  @IsOptional()
  @IsString()
  nameEN?: string;

  @ApiPropertyOptional({ description: '版本号', example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ description: '是否激活' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'PackingChecklistTemplate JSON（若提供则校验必填字段）',
  })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;
}
