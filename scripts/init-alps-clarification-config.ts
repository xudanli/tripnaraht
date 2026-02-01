// scripts/init-alps-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { ALPS_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/alps-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化阿尔卑斯澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'AL' },
      update: {
        destinationName: ALPS_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: ALPS_CONFIG_TEMPLATE as any,
        metadata: ALPS_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'AL',
        destinationName: ALPS_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: ALPS_CONFIG_TEMPLATE as any,
        metadata: ALPS_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ 阿尔卑斯配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', ALPS_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', ALPS_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
    console.log('   用户画像数量:', ALPS_CONFIG_TEMPLATE.userPersonas?.user_personas?.length || 0);
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
