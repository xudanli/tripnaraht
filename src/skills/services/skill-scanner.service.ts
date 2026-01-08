// src/skills/services/skill-scanner.service.ts
/**
 * Skill Scanner Service
 * 
 * 在 NestJS 启动时扫描所有带有 @Skill() 装饰器的类，自动注册到 Registry
 */

import { Injectable, Logger, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill } from '../interfaces/skill.interface';
import { SKILL_METADATA_KEY } from '../decorators/skill.decorator';
import { SkillsRegistryService } from './skills-registry.service';

@Injectable()
export class SkillScannerService {
  private readonly logger = new Logger(SkillScannerService.name);
  private readonly registeredToolNames = new Set<string>(); // 用于检测命名冲突

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly skillsRegistry: SkillsRegistryService,
  ) {}

  /**
   * 扫描并注册所有带有 @Skill() 装饰器的类
   * 
   * @param skillClasses 所有 Skill 类（从 SkillsModule 传入）
   * @throws Error 如果检测到命名冲突
   */
  async scanAndRegisterSkills(skillClasses: Type<Skill>[]): Promise<void> {
    this.logger.log(`开始扫描 ${skillClasses.length} 个 Skill 类...`);

    let registeredCount = 0;
    let skippedCount = 0;
    const pendingRegistrations: Array<{ skill: Skill; className: string; toolName: string }> = [];

    // 第一阶段：收集所有待注册的 Skills（先不注册，以便检测冲突）
    for (const SkillClass of skillClasses) {
      try {
        // 检查是否有 @Skill() 装饰器的元数据
        const metadata = Reflect.getMetadata(SKILL_METADATA_KEY, SkillClass);
        
        if (!metadata) {
          // 如果没有装饰器元数据，跳过（可能是旧的手动注册的 Skill）
          this.logger.debug(`跳过 ${SkillClass.name}：未找到 @Skill() 装饰器`);
          skippedCount++;
          continue;
        }

        // 尝试从 NestJS 容器获取实例
        let skillInstance: Skill;
        try {
          skillInstance = this.moduleRef.get(SkillClass, { strict: false });
        } catch (error) {
          // 如果获取不到，尝试创建新实例（可能需要手动注入依赖）
          this.logger.warn(`无法从容器获取 ${SkillClass.name}，跳过自动注册`);
          skippedCount++;
          continue;
        }

        // 验证实例是否实现了 Skill 接口
        if (!skillInstance || typeof skillInstance.execute !== 'function') {
          this.logger.warn(`${SkillClass.name} 未实现 Skill 接口，跳过`);
          skippedCount++;
          continue;
        }

        // 如果实例已有 metadata，使用实例的 metadata；否则使用装饰器的 metadata
        if (!skillInstance.metadata) {
          skillInstance.metadata = metadata;
        }

        // 生成最终的 MCP 工具名称（tripnara.{category}.{name}）
        const toolName = `tripnara.${metadata.name}`;

        // 检测命名冲突（Fail Fast）
        // 1. 检查是否已经在待注册列表中（同批次冲突）
        const existingPending = pendingRegistrations.find(r => r.toolName === toolName);
        if (existingPending) {
          throw new Error(
            `❌ 命名冲突检测: Skill "${toolName}" 在本次扫描中重复！\n` +
            `   冲突的类: ${SkillClass.name} vs ${existingPending.className}\n` +
            `   请检查 Skills 的 name 是否重复。`,
          );
        }

        // 2. 检查是否已经被手动注册（之前已注册的）
        if (this.skillsRegistry.hasSkill(metadata.name)) {
          const existingSkill = this.skillsRegistry.getSkill(metadata.name);
          const existingClassName = existingSkill ? existingSkill.constructor.name : 'unknown';
          throw new Error(
            `❌ 命名冲突检测: Skill "${toolName}" 已被手动注册！\n` +
            `   冲突的类: ${SkillClass.name} vs ${existingClassName}\n` +
            `   请检查 Skills 的 name 是否重复。`,
          );
        }

        // 添加到待注册列表
        pendingRegistrations.push({
          skill: skillInstance,
          className: SkillClass.name,
          toolName,
        });

      } catch (error: any) {
        // 如果是命名冲突错误，直接抛出（Fail Fast）
        if (error.message?.includes('命名冲突检测')) {
          throw error;
        }
        this.logger.error(`注册 ${SkillClass.name} 失败: ${error.message}`, error.stack);
        skippedCount++;
      }
    }

    // 第二阶段：注册所有 Skills（此时已确保无冲突）
    for (const { skill, className, toolName } of pendingRegistrations) {
      try {
        this.skillsRegistry.registerSkill(skill);
        this.registeredToolNames.add(toolName);
        this.logger.log(`✓ 自动注册: ${skill.metadata.name} (${className})`);
        registeredCount++;
      } catch (error: any) {
        this.logger.error(`注册 ${className} 失败: ${error.message}`, error.stack);
        skippedCount++;
      }
    }

    this.logger.log(
      `扫描完成: 成功注册 ${registeredCount} 个 Skill，跳过 ${skippedCount} 个`,
    );
  }

  /**
   * 获取所有已注册的 Skill 名称列表
   */
  getRegisteredSkillNames(): string[] {
    const allSkills = this.skillsRegistry.getAllSkills();
    return allSkills.map(skill => skill.metadata.name);
  }
}
