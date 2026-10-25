import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoutePackingChecklistDto {
  @ApiProperty({ description: '路线模板 ID（必填，一期一模板一份）', type: Number })
  @Type(() => Number)
  @IsInt()
  routeTemplateId!: number;

  @ApiProperty({ description: '国家码，如 CN / IS', example: 'CN' })
  @IsString()
  @MinLength(2)
  countryCode!: string;

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
