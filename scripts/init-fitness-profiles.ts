/**
 * 用户体力档案初始化脚本
 * 
 * 功能：
 * 1. 为所有现有用户创建默认体力档案快照
 * 2. 创建标准体力模板（新手/普通/进阶/专业）
 * 3. 生成初始体力报告模板
 * 
 * 使用方法：
 *   npx ts-node scripts/init-fitness-profiles.ts
 *   npx ts-node scripts/init-fitness-profiles.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 标准体力档案模板
// assessment_source: QUESTIONNAIRE, HISTORICAL, WEARABLE, FIRST_DAY_TEST, USER_SELF_REPORT, DEFAULT
// fitness_level: LOW, MEDIUM_LOW, MEDIUM, MEDIUM_HIGH, HIGH
// confidence_level: LOW, MEDIUM, HIGH
const FITNESS_TEMPLATES = {
  BEGINNER: {
    level: 'BEGINNER',
    label: '新手',
    max_daily_ascent_m: 300,
    rolling_ascent_3days_m: 500,
    max_slope_pct: 15,
    fitness_score: 30,
    fitness_level: 'LOW',
    confidence_level: 'MEDIUM',
    assessment_source: 'DEFAULT',
    age_modifier: 1.0,
  },
  CASUAL: {
    level: 'CASUAL',
    label: '休闲',
    max_daily_ascent_m: 500,
    rolling_ascent_3days_m: 900,
    max_slope_pct: 25,
    fitness_score: 50,
    fitness_level: 'MEDIUM_LOW',
    confidence_level: 'MEDIUM',
    assessment_source: 'DEFAULT',
    age_modifier: 1.0,
  },
  MODERATE: {
    level: 'MODERATE',
    label: '普通',
    max_daily_ascent_m: 800,
    rolling_ascent_3days_m: 1500,
    max_slope_pct: 35,
    fitness_score: 65,
    fitness_level: 'MEDIUM',
    confidence_level: 'MEDIUM',
    assessment_source: 'DEFAULT',
    age_modifier: 1.0,
  },
  ACTIVE: {
    level: 'ACTIVE',
    label: '活跃',
    max_daily_ascent_m: 1200,
    rolling_ascent_3days_m: 2500,
    max_slope_pct: 45,
    fitness_score: 80,
    fitness_level: 'MEDIUM_HIGH',
    confidence_level: 'MEDIUM',
    assessment_source: 'DEFAULT',
    age_modifier: 1.0,
  },
  ATHLETIC: {
    level: 'ATHLETIC',
    label: '运动健将',
    max_daily_ascent_m: 1800,
    rolling_ascent_3days_m: 4000,
    max_slope_pct: 60,
    fitness_score: 95,
    fitness_level: 'HIGH',
    confidence_level: 'MEDIUM',
    assessment_source: 'DEFAULT',
    age_modifier: 1.0,
  },
};

// 年龄修正系数
const AGE_MODIFIERS: Record<string, number> = {
  '18-25': 1.1,
  '26-35': 1.0,
  '36-45': 0.95,
  '46-55': 0.85,
  '56-65': 0.75,
  '65+': 0.6,
};

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         用户体力档案初始化脚本                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  // 1. 获取所有用户
  console.log('📋 步骤 1: 检查现有用户');
  const users = await prisma.$queryRaw<any[]>`
    SELECT id, email, created_at FROM users
  `;
  console.log(`   发现 ${users.length} 个用户\n`);
  
  // 2. 检查已有体力档案
  const existingProfiles = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT user_id FROM user_fitness_profile_snapshot
  `;
  const existingUserIds = new Set(existingProfiles.map((p: any) => p.user_id));
  console.log(`   已有体力档案: ${existingProfiles.length} 个用户\n`);
  
  // 3. 为缺失档案的用户创建默认档案
  console.log('📋 步骤 2: 创建默认体力档案');
  const usersNeedProfile = users.filter((u: any) => !existingUserIds.has(u.id));
  console.log(`   需要创建档案: ${usersNeedProfile.length} 个用户\n`);
  
  if (!isDryRun && usersNeedProfile.length > 0) {
    const defaultTemplate = FITNESS_TEMPLATES.MODERATE; // 默认使用"普通"档案
    
    for (const user of usersNeedProfile) {
      await prisma.$executeRaw`
        INSERT INTO user_fitness_profile_snapshot (
          id, user_id, max_daily_ascent_m, rolling_ascent_3days_m,
          max_slope_pct, fitness_score, fitness_level, confidence_level,
          assessment_source, age_modifier, completed_trip_count, snapshot_at, created_at
        ) VALUES (
          gen_random_uuid(),
          ${user.id},
          ${defaultTemplate.max_daily_ascent_m},
          ${defaultTemplate.rolling_ascent_3days_m},
          ${defaultTemplate.max_slope_pct},
          ${defaultTemplate.fitness_score},
          ${defaultTemplate.fitness_level},
          ${defaultTemplate.confidence_level},
          ${defaultTemplate.assessment_source},
          ${defaultTemplate.age_modifier},
          0,
          NOW(),
          NOW()
        )
      `;
    }
    console.log(`   ✅ 已为 ${usersNeedProfile.length} 个用户创建默认档案\n`);
  }
  
  // 4. 创建系统级体力模板记录
  console.log('📋 步骤 3: 存储体力模板到配置');
  
  // 检查是否有 system_config 或类似的表，如果没有就用 metadata 存储
  if (!isDryRun) {
    // 存储模板到全局配置（这里我们用一个简单的方式）
    console.log('   体力模板已定义在代码中:\n');
  }
  
  for (const [key, template] of Object.entries(FITNESS_TEMPLATES)) {
    console.log(`   ${key} (${template.label}):`);
    console.log(`     ├─ 每日最大爬升: ${template.max_daily_ascent_m}m`);
    console.log(`     ├─ 3日累计爬升: ${template.rolling_ascent_3days_m}m`);
    console.log(`     ├─ 最大坡度: ${template.max_slope_pct}%`);
    console.log(`     └─ 体力评分: ${template.fitness_score}\n`);
  }
  
  // 5. 生成数据质量报告
  console.log('📊 体力数据状态报告:\n');
  
  const profileStats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN fitness_level = 'low' THEN 1 END) as low,
      COUNT(CASE WHEN fitness_level = 'medium' THEN 1 END) as medium,
      COUNT(CASE WHEN fitness_level = 'high' THEN 1 END) as high,
      COUNT(CASE WHEN fitness_level = 'very_high' THEN 1 END) as very_high,
      AVG(fitness_score) as avg_score,
      AVG(max_daily_ascent_m) as avg_ascent
    FROM user_fitness_profile_snapshot
  `;
  
  const ps = profileStats[0];
  console.log(`   体力档案总数: ${ps.total}`);
  if (Number(ps.total) > 0) {
    console.log(`   ├─ 低体力: ${ps.low}`);
    console.log(`   ├─ 中等体力: ${ps.medium}`);
    console.log(`   ├─ 高体力: ${ps.high}`);
    console.log(`   ├─ 极高体力: ${ps.very_high}`);
    console.log(`   ├─ 平均体力评分: ${Number(ps.avg_score || 0).toFixed(1)}`);
    console.log(`   └─ 平均每日爬升: ${Number(ps.avg_ascent || 0).toFixed(0)}m`);
  }
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
