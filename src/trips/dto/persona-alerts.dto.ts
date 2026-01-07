// src/trips/dto/persona-alerts.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Persona 类型
 */
export enum PersonaType {
  ABU = 'ABU',
  DR_DRE = 'DR_DRE',
  NEPTUNE = 'NEPTUNE',
}

/**
 * Alert 严重程度
 */
export enum AlertSeverity {
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success',
}

/**
 * Persona Alert 响应 DTO
 */
export class PersonaAlertDto {
  @ApiProperty({ description: '提醒ID', example: 'alert-1' })
  id!: string;

  @ApiProperty({ description: 'Persona类型', enum: PersonaType, example: PersonaType.ABU })
  persona!: PersonaType;

  @ApiProperty({ description: 'Persona名称', example: 'Abu' })
  name!: string;

  @ApiProperty({ description: '提醒标题', example: '安全守护者 Abu（北极熊 🐻‍❄️）' })
  title!: string;

  @ApiProperty({ description: '提醒消息', example: '我注意到北部山区 10 月份道路封闭概率较高\n建议准备备选路线\n你觉得呢？' })
  message!: string;

  @ApiProperty({ description: '严重程度', enum: AlertSeverity, example: AlertSeverity.WARNING })
  severity!: AlertSeverity;

  @ApiProperty({ description: '创建时间', example: '2024-12-30T10:00:00Z' })
  createdAt!: string;

  @ApiPropertyOptional({ description: '元数据', type: Object, additionalProperties: true })
  metadata?: Record<string, any>;
}

