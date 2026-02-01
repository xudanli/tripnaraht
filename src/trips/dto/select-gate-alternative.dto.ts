// src/trips/dto/select-gate-alternative.dto.ts

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 选择 Gate 替代方案的请求 DTO
 */
export class SelectGateAlternativeDto {
  @ApiProperty({
    description: '会话 ID',
    example: 'nl_user123_abc12345',
  })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty({
    description: 'Gate 检查 ID',
    example: 'gl_experience_activity_match',
  })
  @IsString()
  @IsNotEmpty()
  gateCheckId!: string;

  @ApiProperty({
    description: '替代方案 ID（从 alternativeActions 中获取）',
    example: 'gate_alternative_gl_experience_activity_match_0',
  })
  @IsString()
  @IsNotEmpty()
  alternativeId!: string;

  @ApiProperty({
    description: '替代方案动作（用于更新参数）',
    example: 'set_risk_tolerance:medium',
  })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiPropertyOptional({
    description: '用户输入（可选，用于继续澄清流程）',
    example: '好的，我选择中等风险活动',
  })
  @IsString()
  @IsOptional()
  userInput?: string;
}
