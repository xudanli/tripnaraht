/**
 * 三人格 Persona Expression Layer — Swagger / 前端契约 DTO
 * SSOT 类型：src/trips/decision/shared/guardian-presentation.types.ts
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CausalPersonaProjection } from '../../trips/causal-runtime/persona/causal-persona-projection.types';

export class PersonaSupportingLineDto {
  @ApiProperty({ enum: ['ABU', 'DR_DRE', 'NEPTUNE'] })
  persona!: 'ABU' | 'DR_DRE' | 'NEPTUNE';

  @ApiProperty({ example: '🐻‍❄️' })
  icon!: string;

  @ApiProperty({ example: 'Abu' })
  name!: string;

  @ApiProperty({ enum: ['evidence', 'pace', 'repair'] })
  role!: 'evidence' | 'pace' | 'repair';

  @ApiProperty({ example: 'F 路 10 月封闭概率较高，建议改走 1 号公路。' })
  text!: string;
}

export class PersonaStructuredStatusDto {
  @ApiPropertyOptional({
    description: 'Abu 存在性判断',
    example: { existence: 'WARN', action: 'BLOCK' },
  })
  abu?: { existence: string; action?: string };

  @ApiPropertyOptional({
    description: 'Dr.Dre 代价判断',
    example: { cost: 'STRETCHED', action: 'ADJUST' },
  })
  dre?: { cost: string; action?: string };

  @ApiPropertyOptional({ example: { action: 'REPAIR' } })
  neptune?: { action?: string };

  @ApiPropertyOptional({ example: { action: 'CHOOSE' } })
  user?: { action: 'CHOOSE' };
}

export class GuardianPersonaPresentationDto {
  @ApiProperty({ enum: ['single_lead', 'decision_committee'] })
  mode!: 'single_lead' | 'decision_committee';

  @ApiProperty({
    enum: ['SAFETY_BLOCK', 'SAFETY_WARN', 'PACE_COST', 'INTENT_REPAIR', 'MULTI_FACTOR', 'ALL_CLEAR'],
  })
  scenario!: string;

  @ApiProperty({ enum: ['ABU', 'DR_DRE', 'NEPTUNE'] })
  leadSpeaker!: 'ABU' | 'DR_DRE' | 'NEPTUNE';

  @ApiProperty({ example: 'Abu 发现风险' })
  headline!: string;

  @ApiProperty({
    description: '主叙事。planning 较完整；in_trip 为 briefLines 拼接',
    example: '🐻 **Abu**：北部 F 路当前不可通行，已准备替代路线。',
  })
  narrative!: string;

  @ApiPropertyOptional({
    description: '行中阶段 1–3 条 ultra-short 行，可直接做 toast / banner',
    type: [String],
    example: ['Abu：F 路封闭，改走 1 号公路', 'Neptune：已保留冰川体验'],
  })
  briefLines?: string[];

  @ApiProperty({ enum: ['planning', 'in_trip'] })
  expressionPhase!: 'planning' | 'in_trip';

  @ApiProperty({
    enum: ['design_advisory', 'execution_brief'],
    description: 'planning=设计建议；in_trip=执行简报',
  })
  displayStyle!: 'design_advisory' | 'execution_brief';

  @ApiProperty({ type: [PersonaSupportingLineDto] })
  supportingLines!: PersonaSupportingLineDto[];

  @ApiProperty({
    description: '责任动作映射',
    example: { abu: 'BLOCK', neptune: 'REPAIR' },
  })
  actions!: Partial<Record<'abu' | 'dre' | 'neptune' | 'user', string>>;

  @ApiProperty({ type: PersonaStructuredStatusDto })
  structuredStatus!: PersonaStructuredStatusDto;

  @ApiPropertyOptional({
    description: '硬约束已 BLOCK；为 true 时前端禁用 CHOOSE',
    example: false,
  })
  hardConstraintBlocked?: boolean;

  @ApiPropertyOptional({
    description: 'CHOOSE 时结构化选项（勿用 consolidatedDecision.nextSteps 当选项）',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        recommendation: { type: 'string' },
        optionIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  humanDecisionPoints?: Array<{
    id: string;
    question: string;
    options: string[];
    recommendation?: string;
    optionIds?: string[];
  }>;

  @ApiPropertyOptional({
    description: 'humanDecisionPoints 扁平化选项文案',
    type: [String],
  })
  humanDecisionPointsFlat?: string[];
}

export class PersonaStatementDto {
  @ApiProperty({ enum: ['ABU', 'DR_DRE', 'NEPTUNE'] })
  persona!: 'ABU' | 'DR_DRE' | 'NEPTUNE';

  @ApiProperty({ example: '🐻‍❄️' })
  icon!: string;

  @ApiProperty({ example: '世界允不允许' })
  slogan!: string;

  @ApiProperty({ enum: ['ALLOW', 'ADJUST', 'REPLACE', 'REJECT', 'NEED_CONFIRM'] })
  verdict!: string;

  @ApiProperty()
  explanation!: string;

  @ApiPropertyOptional({ enum: ['BLOCK', 'ADJUST', 'REPAIR', 'CHOOSE'] })
  guardianAction?: string;

  @ApiPropertyOptional()
  userChoiceRequired?: boolean;
}

export class PersonaShellOutputDto {
  @ApiProperty({
    description: '三人格详情（抽屉 / 审计展开）',
    example: {
      abu: { persona: 'ABU', verdict: 'REJECT', guardianAction: 'BLOCK' },
      drdre: null,
      neptune: { persona: 'NEPTUNE', verdict: 'REPLACE', guardianAction: 'REPAIR' },
    },
  })
  personas!: {
    abu: PersonaStatementDto | null;
    drdre: PersonaStatementDto | null;
    neptune: PersonaStatementDto | null;
  };

  @ApiProperty({ type: GuardianPersonaPresentationDto })
  presentation!: GuardianPersonaPresentationDto;

  @ApiProperty({
    example: { status: 'REJECT', summary: 'Abu 发现风险', nextSteps: ['查看替代方案'] },
  })
  consolidatedDecision!: {
    status: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
    summary: string;
    nextSteps: string[];
  };

  @ApiProperty({ example: '2026-06-25T12:00:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({
    description:
      'P3 共享因果内核投影（schema=tripnara/causal-persona-projection/v1）；含 Abu/Dre/Neptune slice 与 causalChain',
  })
  causalPersonaProjection?: CausalPersonaProjection;
}
