// scripts/init-lofoten-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { LOFOTEN_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/lofoten-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化罗弗敦澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'LF' },
      update: {
        destinationName: LOFOTEN_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: LOFOTEN_CONFIG_TEMPLATE as any,
        metadata: LOFOTEN_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'LF',
        destinationName: LOFOTEN_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: LOFOTEN_CONFIG_TEMPLATE as any,
        metadata: LOFOTEN_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ 罗弗敦配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', LOFOTEN_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', LOFOTEN_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
    console.log('   用户画像数量:', LOFOTEN_CONFIG_TEMPLATE.userPersonas?.user_personas?.length || 0);
    console.log('   ⚠️  风险等级: 中等（山地环境可能危险）');
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
