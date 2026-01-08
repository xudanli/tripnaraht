#!/usr/bin/env node
/**
 * 检查 Skills 的数据库数据支持情况
 * 
 * 分析每个 Skill 对数据库的依赖程度，评估在没有数据库数据时的可用性
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { McpAppModule } from '../src/mcp/mcp-app.module';
import { SkillsRegistryService } from '../src/skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../src/skills/services/skills-registry.token';
import { PrismaService } from '../src/prisma/prisma.service';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 使用 MCP 模式（不需要数据库）
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';

interface SkillDatabaseSupport {
  name: string;
  category: string;
  databaseDependencies: string[];
  dataRequirements: string[];
  gracefulDegradation: boolean;
  canWorkWithoutData: boolean;
  notes: string;
}

async function checkSkillsDatabaseSupport() {
  console.log('\n📊 检查 Skills 的数据库数据支持情况\n');

  try {
    // 创建应用上下文
    const app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: false,
    });

    const skillsRegistry = app.get<SkillsRegistryService>(SKILLS_REGISTRY_TOKEN, { strict: false });
    const prisma = app.get<PrismaService>(PrismaService, { strict: false });

    if (!skillsRegistry) {
      throw new Error('无法获取 SkillsRegistryService');
    }

    const allSkills = skillsRegistry.getAllSkills();
    console.log(`找到 ${allSkills.length} 个 Skills\n`);

    const supportAnalysis: SkillDatabaseSupport[] = [];

    // 检查数据库连接状态
    const dbConnected = prisma?.isDbConnected?.() || false;
    console.log(`数据库连接状态: ${dbConnected ? '✅ 已连接' : '⚠️  未连接（MCP 模式）'}\n`);

    // 检查关键数据表是否有数据
    const dataChecks: Record<string, { count: number; available: boolean }> = {};

    if (dbConnected && prisma) {
      try {
        const tripCount = await prisma.trip.count();
        dataChecks.trips = { count: tripCount, available: tripCount > 0 };
      } catch (e) {
        dataChecks.trips = { count: 0, available: false };
      }

      try {
        const routeDirectionCount = await prisma.routeDirection.count();
        dataChecks.routeDirections = { count: routeDirectionCount, available: routeDirectionCount > 0 };
      } catch (e) {
        dataChecks.routeDirections = { count: 0, available: false };
      }

      try {
        const readinessPackCount = await prisma.readinessPack.count({ where: { isActive: true } });
        dataChecks.readinessPacks = { count: readinessPackCount, available: readinessPackCount > 0 };
      } catch (e) {
        dataChecks.readinessPacks = { count: 0, available: false };
      }

      try {
        const placeCount = await prisma.place.count();
        dataChecks.places = { count: placeCount, available: placeCount > 0 };
      } catch (e) {
        dataChecks.places = { count: 0, available: false };
      }
    }

    console.log('📦 数据库数据可用性:');
    Object.entries(dataChecks).forEach(([table, info]) => {
      const status = info.available ? '✅' : '❌';
      console.log(`   ${status} ${table}: ${info.count} 条记录`);
    });
    console.log('');

    // 分析每个 Skill
    for (const skill of allSkills) {
      const analysis = analyzeSkillDatabaseSupport(skill, dataChecks);
      supportAnalysis.push(analysis);
    }

    // 输出分析结果
    console.log('📋 Skills 数据库支持分析:\n');
    console.log('='.repeat(80));

    supportAnalysis.forEach((analysis, index) => {
      console.log(`\n${index + 1}. ${analysis.name} (${analysis.category})`);
      console.log(`   数据库依赖: ${analysis.databaseDependencies.length > 0 ? analysis.databaseDependencies.join(', ') : '无'}`);
      console.log(`   数据需求: ${analysis.dataRequirements.length > 0 ? analysis.dataRequirements.join(', ') : '无'}`);
      console.log(`   优雅降级: ${analysis.gracefulDegradation ? '✅ 是' : '❌ 否'}`);
      console.log(`   无数据可用: ${analysis.canWorkWithoutData ? '✅ 是' : '❌ 否'}`);
      if (analysis.notes) {
        console.log(`   备注: ${analysis.notes}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 总结:\n');

    const fullySupported = supportAnalysis.filter(s => s.canWorkWithoutData || (s.databaseDependencies.length > 0 && dataChecks[s.databaseDependencies[0] as keyof typeof dataChecks]?.available)).length;
    const partiallySupported = supportAnalysis.filter(s => s.gracefulDegradation && !s.canWorkWithoutData).length;
    const notSupported = supportAnalysis.filter(s => !s.canWorkWithoutData && !s.gracefulDegradation).length;

    console.log(`✅ 完全支持（有数据或无需数据）: ${fullySupported} 个`);
    console.log(`⚠️  部分支持（优雅降级）: ${partiallySupported} 个`);
    console.log(`❌ 不支持（需要数据）: ${notSupported} 个`);

    // 列出需要数据的 Skills
    const needsData = supportAnalysis.filter(s => !s.canWorkWithoutData && s.databaseDependencies.length > 0);
    if (needsData.length > 0) {
      console.log('\n⚠️  需要数据库数据的 Skills:');
      needsData.forEach(s => {
        const missingData = s.databaseDependencies.filter(dep => !dataChecks[dep as keyof typeof dataChecks]?.available);
        if (missingData.length > 0) {
          console.log(`   - ${s.name}: 缺少 ${missingData.join(', ')}`);
        }
      });
    }

    await app.close();
    console.log('\n✅ 检查完成\n');

  } catch (error: any) {
    console.error('\n❌ 检查失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    process.exit(1);
  }
}

function analyzeSkillDatabaseSupport(skill: any, dataChecks: Record<string, { count: number; available: boolean }>): SkillDatabaseSupport {
  const name = skill.metadata.name;
  const category = skill.metadata.category;

  // 基于 Skill 名称和类别分析数据库依赖
  const analysis: SkillDatabaseSupport = {
    name,
    category,
    databaseDependencies: [],
    dataRequirements: [],
    gracefulDegradation: false,
    canWorkWithoutData: false,
    notes: '',
  };

  // 分析不同类型的 Skills
  if (name.startsWith('trip.')) {
    // Trip Skills 需要 Trip 数据
    analysis.databaseDependencies.push('trips');
    analysis.dataRequirements.push('Trip 记录', 'TripDay 记录', 'ItineraryItem 记录', 'Place 记录');
    analysis.gracefulDegradation = false;
    analysis.canWorkWithoutData = false;
    analysis.notes = '需要完整的 Trip 数据才能工作';
  } else if (name.startsWith('world.')) {
    // World Skills 可能需要 RouteDirection 和 Trip 数据
    analysis.databaseDependencies.push('routeDirections', 'trips');
    analysis.dataRequirements.push('RouteDirection 记录（可选）', 'Trip 记录（如果使用 tripId）');
    analysis.gracefulDegradation = true;
    analysis.canWorkWithoutData = true; // 可以通过参数构建，不依赖数据库
    analysis.notes = '可以通过参数构建 WorldModelContext，但 RouteDirection 数据会增强功能';
  } else if (name.startsWith('decision.')) {
    // Decision Skills 可能需要 WorldModelContext（可能来自数据库）
    analysis.databaseDependencies.push('routeDirections', 'trips');
    analysis.dataRequirements.push('WorldModelContext（可通过参数或数据库构建）');
    analysis.gracefulDegradation = true;
    analysis.canWorkWithoutData = true; // 可以通过参数传入 world context
    analysis.notes = '可以通过参数传入 WorldModelContext，不强制依赖数据库';
  } else if (name.startsWith('readiness.')) {
    // Readiness Skills
    if (name.includes('checkVisaWindow')) {
      analysis.databaseDependencies.push('readinessPacks');
      analysis.dataRequirements.push('ReadinessPack 记录（可选）');
      analysis.gracefulDegradation = true;
      analysis.canWorkWithoutData = true;
      analysis.notes = '有 ReadinessPack 数据会增强准确性，但可以使用默认逻辑';
    } else {
      analysis.databaseDependencies.push('readinessPacks', 'routeDirections');
      analysis.dataRequirements.push('ReadinessPack 记录', 'RouteDirection 记录');
      analysis.gracefulDegradation = true;
      analysis.canWorkWithoutData = true; // 可以通过参数传入 world context
      analysis.notes = '可以通过参数传入 WorldModelContext';
    }
  } else if (name.startsWith('routeDirection.')) {
    // RouteDirection Skills 需要 RouteDirection 数据
    analysis.databaseDependencies.push('routeDirections');
    analysis.dataRequirements.push('RouteDirection 记录');
    analysis.gracefulDegradation = true;
    analysis.canWorkWithoutData = false; // 需要 RouteDirection 数据
    analysis.notes = '需要 RouteDirection 数据，但可以返回空列表';
  } else if (name.startsWith('countryPack.')) {
    // CountryPack Skills 不需要数据库数据
    analysis.databaseDependencies = [];
    analysis.dataRequirements = [];
    analysis.gracefulDegradation = true;
    analysis.canWorkWithoutData = true;
    analysis.notes = '完全基于输入参数工作，不依赖数据库数据';
  } else if (name.startsWith('dem.')) {
    // DEM Skills 不需要数据库数据
    analysis.databaseDependencies = [];
    analysis.dataRequirements = [];
    analysis.gracefulDegradation = true;
    analysis.canWorkWithoutData = true;
    analysis.notes = '基于输入的地理坐标计算，不依赖数据库数据';
  }

  return analysis;
}

// 运行检查
checkSkillsDatabaseSupport().catch(console.error);

