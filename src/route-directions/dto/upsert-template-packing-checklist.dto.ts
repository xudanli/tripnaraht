import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 按模板 upsert 打包清单（不传 routeTemplateId，由路径参数决定） */
export class UpsertTemplatePackingChecklistDto {
  @ApiPropertyOptional({ description: '国家码；省略时从模板所属路线方向推断' })
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

  @ApiPropertyOptional({ description: '是否激活', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description:
      'PackingChecklistTemplate JSON（必含 metadata.version、三季速查、pre_departure_final_checklist）',
  })
  @IsObject()
  templateData!: Record<string, any>;
}
