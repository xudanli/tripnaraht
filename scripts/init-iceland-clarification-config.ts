// scripts/init-iceland-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { ICELAND_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/iceland-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化冰岛澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'IS' },
      update: {
        destinationName: ICELAND_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: ICELAND_CONFIG_TEMPLATE as any,
        metadata: ICELAND_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'IS',
        destinationName: ICELAND_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: ICELAND_CONFIG_TEMPLATE as any,
        metadata: ICELAND_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ 冰岛配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', ICELAND_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', ICELAND_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
