// src/agent/utils/skill-action-adapter.interface.ts

/**
 * 迁移适配器接口（预留）
 * 
 * 用于 Skills ↔ Actions 互通：
 * - Legacy 调用 Skills: SkillActionAdapter
 * - Claude 调用 Actions: ActionSkillAdapter（可选）
 */

/**
 * Skill → Action 适配器接口
 * 
 * 用于 Legacy 路由调用 Skills
 */
export interface ISkillActionAdapter {
  /**
   * 适配器名称（对应 Action 名称）
   */
  readonly actionName: string;
  
  /**
   * 对应的 Skill 名称
   */
  readonly skillName: string;
  
  /**
   * 执行 Skill（包装为 Action）
   */
  execute(input: any): Promise<any>;
}

/**
 * Action → Skill 适配器接口（不推荐，但允许）
 * 
 * 用于 Claude 编排调用 Actions
 */
export interface IActionSkillAdapter {
  /**
   * 适配器名称（对应 Skill 名称）
   */
  readonly skillName: string;
  
  /**
   * 对应的 Action 名称
   */
  readonly actionName: string;
  
  /**
   * 执行 Action（包装为 Skill）
   */
  execute(input: any): Promise<any>;
}

/**
 * 适配器注册表接口
 */
export interface IAdapterRegistry {
  /**
   * 注册 Skill → Action 适配器
   */
  registerSkillActionAdapter(adapter: ISkillActionAdapter): void;
  
  /**
   * 注册 Action → Skill 适配器（不推荐）
   */
  registerActionSkillAdapter(adapter: IActionSkillAdapter): void;
  
  /**
   * 获取 Skill → Action 适配器
   */
  getSkillActionAdapter(actionName: string): ISkillActionAdapter | undefined;
  
  /**
   * 获取 Action → Skill 适配器
   */
  getActionSkillAdapter(skillName: string): IActionSkillAdapter | undefined;
}
