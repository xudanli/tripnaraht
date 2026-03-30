// src/trips/nl-clarification/dto/create-or-update-config.dto.ts

import { IsString, IsBoolean, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DestinationClarificationConfig } from '../config/destination-clarification.config';

export class CreateOrUpdateDestinationClarificationConfigDto {
  @ApiProperty({ description: '目的地名称' })
  @IsString()
  destinationName!: string;

  @ApiProperty({ description: '是否启用' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ description: '配置内容', type: Object })
  @IsObject()
  config!: DestinationClarificationConfig;

  @ApiPropertyOptional({ description: '元数据', type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class TestConfigDto {
  @ApiProperty({ description: '当前参数', type: Object })
  @IsObject()
  currentParams!: Record<string, any>;

  @ApiProperty({ description: '用户输入' })
  @IsString()
  userInput!: string;
}
