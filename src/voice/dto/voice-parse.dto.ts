// src/voice/dto/voice-parse.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 站点 DTO（用于 Swagger 文档）
 */
export class StopDto {
  @ApiProperty({ example: 'POI' })
  kind: string;

  @ApiProperty({ example: '6211' })
  id: string;

  @ApiPropertyOptional({ example: '东京塔' })
  name?: string;

  @ApiProperty({ example: 540 })
  startMin: number;

  @ApiProperty({ example: 660 })
  endMin: number;

  @ApiPropertyOptional({ example: 35.6762 })
  lat?: number;

  @ApiPropertyOptional({ example: 139.6503 })
  lng?: number;
}

/**
 * 日程排程结果 DTO（用于 Swagger 文档）
 */
export class DayScheduleResultDto {
  @ApiProperty({ type: [StopDto] })
  stops: StopDto[];

  @ApiPropertyOptional({ type: Object })
  metrics?: Record<string, any>;
}

/**
 * 语音解析请求 DTO
 */
export class VoiceParseRequestDto {
  @ApiProperty({ example: '今天下一站是什么？' })
  transcript: string;

  @ApiProperty({ type: DayScheduleResultDto })
  schedule: DayScheduleResultDto;
}
