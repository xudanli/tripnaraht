// src/trips/dto/persona-alerts.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Persona 类型
 */
export enum PersonaType {
  ABU = 'ABU',
  DR_DRE = 'DR_DRE',
  NEPTUNE = 'NEPTUNE',
  /** 编排侧系统步骤（非三人格建议，C 端 audience=user 不得返回） */
  USER_ACTION = 'USER_ACTION',
}

/**
 * Alert 严重程度
 */
export enum AlertSeverity {
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success',
}

export class PersonaAlertDeepLinkDto {
  @ApiProperty({
    enum: ['feasibility', 'schedule_day', 'decision_log', 'plan_gate', 'decision_checker'],
  })
  type!: 'feasibility' | 'schedule_day' | 'decision_log' | 'plan_gate' | 'decision_checker';

  @ApiPropertyOptional()
  issueId?: string;

  @ApiPropertyOptional({ minimum: 1 })
  dayIndex?: number;

  @ApiPropertyOptional()
  decisionLogId?: string;
}

export class GuardianPresentationSnapshotDto {
  @ApiPropertyOptional()
  headline?: string;

  @ApiPropertyOptional()
  narrative?: string;

  @ApiPropertyOptional({ type: [String] })
  briefLines?: string[];

  @ApiPropertyOptional({ enum: ['ABU', 'DR_DRE', 'NEPTUNE'] })
  leadSpeaker?: 'ABU' | 'DR_DRE' | 'NEPTUNE';

  @ApiPropertyOptional({
    enum: ['SAFETY_BLOCK', 'SAFETY_WARN', 'PACE_COST', 'INTENT_REPAIR', 'MULTI_FACTOR', 'ALL_CLEAR'],
  })
  scenario?: string;

  @ApiPropertyOptional({ enum: ['design_advisory', 'execution_brief'] })
  displayStyle?: 'design_advisory' | 'execution_brief';

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['BLOCK', 'ADJUST', 'REPAIR', 'CHOOSE'] },
  })
  actions?: Partial<Record<string, 'BLOCK' | 'ADJUST' | 'REPAIR' | 'CHOOSE'>>;

  @ApiPropertyOptional({
    enum: ['planning', 'in_trip'],
  })
  expressionPhase?: 'planning' | 'in_trip';

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        persona: { type: 'string', enum: ['ABU', 'DR_DRE', 'NEPTUNE'] },
        role: { type: 'string', enum: ['evidence', 'pace', 'repair'] },
        text: { type: 'string' },
      },
    },
  })
  supportingLines?: Array<{
    persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    role?: 'evidence' | 'pace' | 'repair';
    text: string;
  }>;

  @ApiPropertyOptional({ description: '硬约束 BLOCK 时前端禁用 CHOOSE' })
  hardConstraintBlocked?: boolean;
}

export class PersonaAlertMetadataDto {
  @ApiProperty({ enum: ['user', 'internal'] })
  audience!: 'user' | 'internal';

  @ApiPropertyOptional()
  scenario?: string;

  @ApiPropertyOptional({ enum: ['ALLOW', 'REJECT', 'ADJUST', 'REPLACE'] })
  action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';

  @ApiPropertyOptional({ enum: ['PHYSICAL', 'HUMAN', 'PHILOSOPHY', 'HEURISTIC'] })
  decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';

  @ApiPropertyOptional({ type: [String], description: '内部稳定码；C 端勿直接展示' })
  reasonCodes?: string[];

  @ApiPropertyOptional({ type: [String], description: '与 reasonCodes 对应的中文短因' })
  reasonCodesDisplayZh?: string[];

  @ApiPropertyOptional()
  readinessEvidenceDisplayZh?: string;

  @ApiPropertyOptional({ enum: ['planning', 'in_trip'] })
  expressionPhase?: 'planning' | 'in_trip';

  @ApiPropertyOptional()
  issueId?: string;

  @ApiPropertyOptional({ type: PersonaAlertDeepLinkDto })
  deepLink?: PersonaAlertDeepLinkDto;

  /** 历史/扩展：建议作用域 */
  @ApiPropertyOptional()
  dayId?: string;

  @ApiPropertyOptional()
  itemId?: string;

  @ApiPropertyOptional({ type: [String] })
  evidenceRefs?: string[];

  @ApiPropertyOptional({ type: [Object] })
  alternatives?: unknown[];

  @ApiPropertyOptional()
  roadId?: string;

  /** 历史/扩展字段 */
  [key: string]: unknown;
}

/**
 * Persona Alert 响应 DTO（C 端 BFF 人话投影）
 */
export class PersonaAlertDto {
  @ApiProperty({ description: '提醒 ID', example: 'alert-abu-wind-d3' })
  id!: string;

  @ApiProperty({ description: 'Persona 类型', enum: PersonaType, example: PersonaType.ABU })
  persona!: PersonaType;

  @ApiProperty({ description: '严重程度', enum: AlertSeverity, example: AlertSeverity.WARNING })
  severity!: AlertSeverity;

  @ApiProperty({
    description: '问题短标题（中文），非人格昵称',
    example: '当前方案被安全门控拦截',
    maxLength: 40,
  })
  title!: string;

  @ApiProperty({
    description: 'C 端主文案（1–2 句完整中文 + 可操作建议）',
    example: '第 3 天大风条件下不建议自驾穿越高地；请打开可执行证明查看调整项。',
    maxLength: 500,
  })
  explanation!: string;

  @ApiPropertyOptional({
    description: '可选 debug/日志；C 端 UI 不得作为主文案 fallback',
  })
  message?: string;

  @ApiPropertyOptional({
    description: '历史字段；C 端不展示',
    deprecated: true,
  })
  name?: string;

  @ApiProperty({ description: '创建时间', example: '2024-12-30T10:00:00Z' })
  createdAt!: string;

  @ApiPropertyOptional({ type: GuardianPresentationSnapshotDto })
  presentation?: GuardianPresentationSnapshotDto;

  @ApiProperty({ type: PersonaAlertMetadataDto })
  metadata!: PersonaAlertMetadataDto;
}

export class GetPersonaAlertsQueryDto {
  @ApiPropertyOptional({ enum: ['user', 'internal'], default: 'user' })
  @IsOptional()
  @IsEnum(['user', 'internal'])
  audience?: 'user' | 'internal';

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: ['planning', 'in_trip'] })
  @IsOptional()
  @IsEnum(['planning', 'in_trip'])
  phase?: 'planning' | 'in_trip';
}
