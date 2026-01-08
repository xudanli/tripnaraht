// src/skills/interfaces/base-skill-input.interface.ts
/**
 * Base Skill Input Interface
 * 
 * 所有 Skill Input 的基础接口，提供通用功能
 */

import { IsBoolean, IsOptional } from 'class-validator';
import { SkillInput } from './skill.interface';

export interface BaseSkillInput extends SkillInput {
  /**
   * Dry Run 模式
   * 
   * 如果为 true，只验证参数有效性，不执行实际操作
   * 这对于 Agent 非常有用：
   * - Agent 可以先 dryRun: true 看看参数对不对
   * - 如果报错了 Agent 可以自我修正
   * - 然后再发起真正的调用
   */
  dryRun?: boolean;
}

/**
 * Base Skill Input DTO（用于 class-validator）
 */
export class BaseSkillInputDto implements BaseSkillInput {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
