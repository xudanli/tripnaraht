// scripts/verify-feature-flags-tables.ts
/**
 * 验证 Feature Flags 表是否创建成功
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 验证 Feature Flags 表...\n');

    // 检查 UserFeatureFlag 表
    const userFlagCount = await prisma.userFeatureFlag.count();
    console.log(`✅ UserFeatureFlag 表存在，当前记录数: ${userFlagCount}`);

    // 检查 GlobalFeatureFlag 表
    const globalFlagCount = await prisma.globalFeatureFlag.count();
    console.log(`✅ GlobalFeatureFlag 表存在，当前记录数: ${globalFlagCount}`);

    // 检查默认 Feature Flag
    const defaultFlag = await prisma.globalFeatureFlag.findUnique({
      where: { feature: 'readiness_ai_enhancement' },
    });

    if (defaultFlag) {
      console.log(`✅ 默认 Feature Flag 存在: readiness_ai_enhancement (enabled: ${defaultFlag.enabled})`);
    } else {
      console.log(`⚠️  默认 Feature Flag 不存在`);
    }

    console.log('\n✅ 所有表验证通过！');
  } catch (error) {
    console.error('❌ 验证失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
