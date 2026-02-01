// scripts/init-tibet-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { TIBET_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/tibet-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化西藏澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'XZ' },
      update: {
        destinationName: TIBET_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: TIBET_CONFIG_TEMPLATE as any,
        metadata: TIBET_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'XZ',
        destinationName: TIBET_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: TIBET_CONFIG_TEMPLATE as any,
        metadata: TIBET_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ 西藏配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', TIBET_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', TIBET_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
    console.log('   ⚠️  风险等级: 极高（Layer 1 红线警告 - 高原反应可能致命）');
    console.log('   风险知识库: 包含4种高原反应风险（AMS、HACE、HAPE、严重反应）');
  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
