#!/usr/bin/env node
/**
 * 导入生成的 Skeleton Pack 到数据库
 * 
 * 用法：
 *   npx tsx scripts/import-skeleton-pack.ts <countryCode> [packType]
 * 
 * 示例：
 *   npx tsx scripts/import-skeleton-pack.ts IS readiness
 *   npx tsx scripts/import-skeleton-pack.ts IS routeDirection
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { McpAppModule } from '../src/mcp/mcp-app.module';
import { SkillsRegistryService } from '../src/skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../src/skills/services/skills-registry.token';
import { PackStorageService } from '../src/trips/readiness/storage/pack-storage.service';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 禁用 MCP 模式，确保数据库连接正常
process.env.MCP_MODE = 'false';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE = 'false'; // 需要数据库来保存

interface CountryInfo {
  code: string;
  name: string;
  nameCN: string;
}

const COUNTRY_MAP: Record<string, CountryInfo> = {
  IS: { code: 'IS', name: 'Iceland', nameCN: '冰岛' },
  NO: { code: 'NO', name: 'Norway', nameCN: '挪威' },
  CN: { code: 'CN', name: 'China', nameCN: '中国' },
  // 可以继续添加更多国家
};

async function importSkeletonPack(countryCode: string, packType: 'readiness' | 'routeDirection' = 'readiness') {
  console.log(`\n📦 导入 Skeleton Pack: ${countryCode} (${packType})\n`);

  try {
    // 1. 创建应用上下文
    console.log('步骤 1: 创建应用上下文...');
    const app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn'], // 减少日志输出
    });
    
    // 等待一下确保所有模块都初始化完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ 应用上下文创建成功\n');

    // 2. 获取服务
    const skillsRegistry = app.get<SkillsRegistryService>(SKILLS_REGISTRY_TOKEN, { strict: false });
    const packStorage = app.get<PackStorageService>(PackStorageService, { strict: false });

    if (!skillsRegistry || !packStorage) {
      throw new Error('无法获取必要的服务');
    }

    // 3. 获取国家信息
    const countryInfo = COUNTRY_MAP[countryCode.toUpperCase()];
    if (!countryInfo) {
      throw new Error(`未知的国家代码: ${countryCode}`);
    }

    // 4. 调用 newSkeleton skill 生成 Pack
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
    console.log(`   规则数量: ${skeleton.rules?.length || skeleton.routeDirections?.length || 0}`);
    
    if (skeleton.rules) {
      console.log(`   规则类别: ${skeleton.rules.map((r: any) => r.category).join(', ')}`);
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
        console.warn('⚠️  验证警告:');
        validation.errors?.forEach((err: any) => {
          console.warn(`  - ${err.path}: ${err.message}`);
        });
      } else {
        console.log('✅ Pack 验证通过\n');
      }
    }

    // 6. 保存到数据库
    console.log('步骤 4: 保存到数据库...');
    if (packType === 'readiness') {
      try {
        // 检查 PrismaService 是否已连接数据库
        const prismaService = app.get('PrismaService', { strict: false });
        const isConnected = prismaService?.isDbConnected?.() || false;
        
        if (!isConnected) {
          console.warn('⚠️  数据库未连接，跳过保存步骤');
          console.log('   提示：请确保 DATABASE_URL 环境变量已正确配置\n');
        } else {
          const success = await packStorage.savePack(skeleton);
          if (success) {
            console.log('✅ Pack 已成功保存到数据库\n');
          } else {
            console.error('❌ 保存失败，但 Pack 数据已生成\n');
          }
        }
      } catch (error: any) {
        console.warn(`⚠️  保存时出错: ${error.message}`);
        console.log('   但 Pack 数据已成功生成，可以手动保存\n');
      }
    } else {
      console.log('⚠️  RouteDirection Pack 暂不支持直接保存到数据库');
      console.log('   请手动将 Pack 数据保存到文件或使用其他导入方式\n');
    }
    
    // 输出生成的 Pack 数据（JSON 格式）
    console.log('步骤 4.5: 生成的 Pack 数据（JSON）:');
    console.log(JSON.stringify(skeleton, null, 2));
    console.log('');

    // 7. 显示改进建议
    console.log('步骤 5: 生成改进建议...');
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
          console.log(`        当前: ${gap.current}, 建议: ${gap.recommended}`);
        });
      }
      
      if (suggestions.priorityTodo && suggestions.priorityTodo.length > 0) {
        console.log(`\n   优先级待办:`);
        suggestions.priorityTodo.forEach((todo: any, idx: number) => {
          console.log(`     ${idx + 1}. [${todo.priority}] ${todo.task}`);
        });
      }
      console.log('');
    }

    // 8. 清理
    await app.close();
    console.log('✅ 完成！\n');

  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
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
    console.error('用法: npx tsx scripts/import-skeleton-pack.ts <countryCode> [packType]');
    console.error('示例: npx tsx scripts/import-skeleton-pack.ts IS readiness');
    process.exit(1);
  }

  if (packType !== 'readiness' && packType !== 'routeDirection') {
    console.error('packType 必须是 "readiness" 或 "routeDirection"');
    process.exit(1);
  }

  await importSkeletonPack(countryCode, packType);
}

main().catch(console.error);

