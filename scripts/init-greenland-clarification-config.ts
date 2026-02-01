// scripts/init-greenland-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { GREENLAND_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/destination-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化格陵兰澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'GL' },
      update: {
        destinationName: GREENLAND_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: GREENLAND_CONFIG_TEMPLATE as any,
        metadata: GREENLAND_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'GL',
        destinationName: GREENLAND_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: GREENLAND_CONFIG_TEMPLATE as any,
        metadata: GREENLAND_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ 格陵兰配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', GREENLAND_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', GREENLAND_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
    console.log('   用户画像:', GREENLAND_CONFIG_TEMPLATE.userPersonas?.user_personas?.length || 0, '个画像');
  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
