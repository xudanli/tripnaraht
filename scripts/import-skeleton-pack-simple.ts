#!/usr/bin/env node
/**
 * 简化版：生成 Skeleton Pack 并保存到文件
 * 
 * 用法：
 *   npx tsx scripts/import-skeleton-pack-simple.ts <countryCode> [packType]
 * 
 * 示例：
 *   npx tsx scripts/import-skeleton-pack-simple.ts IS readiness
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { writeFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { McpAppModule } from '../src/mcp/mcp-app.module';
import { SkillsRegistryService } from '../src/skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../src/skills/services/skills-registry.token';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 使用 MCP 模式（不需要数据库）
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

interface CountryInfo {
  code: string;
  name: string;
  nameCN: string;
}

const COUNTRY_MAP: Record<string, CountryInfo> = {
  IS: { code: 'IS', name: 'Iceland', nameCN: '冰岛' },
  NO: { code: 'NO', name: 'Norway', nameCN: '挪威' },
  CN: { code: 'CN', name: 'China', nameCN: '中国' },
};

async function generateSkeletonPack(countryCode: string, packType: 'readiness' | 'routeDirection' = 'readiness') {
  console.log(`\n📦 生成 Skeleton Pack: ${countryCode} (${packType})\n`);

  try {
    // 1. 创建应用上下文（MCP 模式，不连接数据库）
    console.log('步骤 1: 初始化应用上下文（MCP 模式）...');
    const app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: false, // 关闭日志以加快速度
    });
    console.log('✅ 应用上下文初始化成功\n');

    // 2. 获取 Skills Registry
    const skillsRegistry = app.get<SkillsRegistryService>(SKILLS_REGISTRY_TOKEN, { strict: false });
    if (!skillsRegistry) {
      throw new Error('无法获取 SkillsRegistryService');
    }

    // 3. 获取国家信息
    const countryInfo = COUNTRY_MAP[countryCode.toUpperCase()];
    if (!countryInfo) {
      throw new Error(`未知的国家代码: ${countryCode}。支持的国家：${Object.keys(COUNTRY_MAP).join(', ')}`);
    }

    // 4. 生成 Skeleton Pack
    console.log(`步骤 2: 生成 ${countryInfo.nameCN} 的 Skeleton Pack...`);
    const newSkeletonSkill = skillsRegistry.getSkill('countryPack.newSkeleton');
    if (!newSkeletonSkill) {
      throw new Error('找不到 countryPack.newSkeleton skill');
    }

    const skeletonResult = await newSkeletonSkill.execute({
      countryCode: countryInfo.code,
      countryName: countryInfo.name,
      countryNameCN: countryInfo.nameCN,
      packType,
    });

    const skeleton = (skeletonResult as any).skeleton;
    if (!skeleton) {
      throw new Error('Skeleton 生成失败：返回结果为空');
    }

    console.log(`✅ Skeleton Pack 生成成功`);
    console.log(`   Pack ID: ${skeleton.packId || skeleton.countryCode}`);
    if (skeleton.rules) {
      console.log(`   规则数量: ${skeleton.rules.length}`);
      console.log(`   规则类别: ${skeleton.rules.map((r: any) => r.category).join(', ')}`);
    }
    if (skeleton.checklists) {
      console.log(`   清单数量: ${skeleton.checklists.length}`);
    }
    if (skeleton.routeDirections) {
      console.log(`   路线方向数量: ${skeleton.routeDirections.length}`);
    }
    console.log('');

    // 5. 验证 Pack
    console.log('步骤 3: 验证 Pack...');
    const validateSkill = skillsRegistry.getSkill('countryPack.validate');
    if (validateSkill) {
      const validateResult = await validateSkill.execute({
        pack: skeleton,
        packType,
      });
      const validation = validateResult as any;
      if (!validation.valid) {
        console.warn('⚠️  验证发现问题:');
        validation.errors?.slice(0, 5).forEach((err: any) => {
          console.warn(`  - ${err.path}: ${err.message}`);
        });
        if (validation.errors.length > 5) {
          console.warn(`  ... 还有 ${validation.errors.length - 5} 个错误`);
        }
      } else {
        console.log('✅ Pack 验证通过\n');
      }
    }

    // 6. 生成改进建议
    console.log('步骤 4: 生成改进建议...');
    const suggestSkill = skillsRegistry.getSkill('countryPack.suggestImprovements');
    if (suggestSkill) {
      const suggestResult = await suggestSkill.execute({
        countryCode: countryInfo.code,
        packType,
        currentPackSnapshot: skeleton,
      });
      const suggestions = suggestResult as any;
      
      console.log(`\n📊 改进建议:`);
      console.log(`   缺失字段: ${suggestions.missingFields?.length || 0}`);
      console.log(`   质量缺口: ${suggestions.qualityGaps?.length || 0}`);
      console.log(`   待办事项: ${suggestions.priorityTodo?.length || 0}`);
      
      if (suggestions.qualityGaps && suggestions.qualityGaps.length > 0) {
        console.log(`\n   质量缺口详情:`);
        suggestions.qualityGaps.forEach((gap: any, idx: number) => {
          console.log(`     ${idx + 1}. [${gap.category}] ${gap.issue}`);
          console.log(`        当前: ${gap.current}, 建议: ${gap.recommended} (影响: ${gap.impact})`);
        });
      }
      
      if (suggestions.priorityTodo && suggestions.priorityTodo.length > 0) {
        console.log(`\n   优先级待办（前 3 项）:`);
        suggestions.priorityTodo.slice(0, 3).forEach((todo: any, idx: number) => {
          console.log(`     ${idx + 1}. [${todo.priority}] ${todo.task}`);
          console.log(`        工作量: ${todo.estimatedEffort}, 影响: ${todo.impact}`);
        });
      }
      console.log('');
    }

    // 7. 保存到文件
    const outputDir = path.join(__dirname, '../src/trips/readiness/data/packs');
    const fileName = skeleton.packId 
      ? `${skeleton.packId}.json`
      : `pack.${countryCode.toLowerCase()}.${packType}.json`;
    const filePath = path.join(outputDir, fileName);

    console.log('步骤 5: 保存 Pack 到文件...');
    console.log(`   文件路径: ${filePath}`);
    
    // 确保目录存在
    const { mkdirSync } = await import('fs');
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (e) {
      // 目录可能已存在
    }
    
    writeFileSync(filePath, JSON.stringify(skeleton, null, 2), 'utf-8');
    console.log(`✅ Pack 已保存到文件\n`);

    // 8. 清理
    await app.close();

    console.log('✅ 完成！');
    console.log(`\n📝 下一步：`);
    console.log(`   1. 查看生成的 Pack 文件: ${filePath}`);
    console.log(`   2. 如需导入数据库，运行: npx tsx scripts/check-and-import-readiness-packs.ts import ${filePath}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ 生成失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 主函数
async function main() {
  const countryCode = process.argv[2];
  const packType = (process.argv[3] || 'readiness') as 'readiness' | 'routeDirection';

  if (!countryCode) {
    console.error('用法: npx tsx scripts/import-skeleton-pack-simple.ts <countryCode> [packType]');
    console.error('示例: npx tsx scripts/import-skeleton-pack-simple.ts IS readiness');
    process.exit(1);
  }

  await generateSkeletonPack(countryCode, packType);
}

main().catch(console.error);

