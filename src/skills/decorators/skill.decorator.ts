// src/skills/decorators/skill.decorator.ts
/**
 * @Skill() 装饰器
 * 
 * 用于标记 Skill 类，实现自动注册功能
 * 
 * 使用方式：
 * ```typescript
 * @Skill({
 *   name: 'mySkill',
 *   description: '我的技能',
 *   version: '1.0.0',
 *   category: 'analytics',
 * })
 * @Injectable()
 * export class MySkill implements Skill {
 *   // ...
 * }
 * ```
 */

import 'reflect-metadata';
import { SkillMetadata } from '../interfaces/skill.interface';

export const SKILL_METADATA_KEY = Symbol('skill:metadata');
export const SKILL_CLASS_KEY = Symbol('skill:class');

export interface SkillDecoratorOptions extends SkillMetadata {}

/**
 * Skill 装饰器
 * 
 * @param options Skill 元数据
 */
export function Skill(options: SkillDecoratorOptions) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    // 保存元数据到类的元数据中
    Reflect.defineMetadata(SKILL_METADATA_KEY, options, target);
    Reflect.defineMetadata(SKILL_CLASS_KEY, target, target);
    
    return target;
  };
}

/**
 * 从类中获取 Skill 元数据
 */
export function getSkillMetadata(target: any): SkillDecoratorOptions | undefined {
  return Reflect.getMetadata(SKILL_METADATA_KEY, target);
}
