// scripts/init-k2-clarification-config.ts

import { PrismaClient } from '@prisma/client';
import { K2_CONFIG_TEMPLATE } from '../src/trips/nl-clarification/config/destination-clarification.config';

const prisma = new PrismaClient();

async function main() {
  console.log('初始化K2澄清配置...');
  
  try {
    const config = await prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: 'K2' },
      update: {
        destinationName: K2_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: K2_CONFIG_TEMPLATE as any,
        metadata: K2_CONFIG_TEMPLATE.metadata as any,
        updatedAt: new Date(),
        updatedBy: 'system',
      },
      create: {
        destinationCode: 'K2',
        destinationName: K2_CONFIG_TEMPLATE.destinationName,
        enabled: true,
        config: K2_CONFIG_TEMPLATE as any,
        metadata: K2_CONFIG_TEMPLATE.metadata as any,
        createdBy: 'system',
      },
    });
    
    console.log('✅ K2配置已创建/更新:', config.id);
    console.log('   目的地代码:', config.destinationCode);
    console.log('   目的地名称:', config.destinationName);
    console.log('   启用状态:', config.enabled);
    console.log('   澄清轮次:', K2_CONFIG_TEMPLATE.clarificationRounds.length);
    console.log('   Gate 预检查:', K2_CONFIG_TEMPLATE.gatePrechecks?.length || 0);
    console.log('   用户画像:', K2_CONFIG_TEMPLATE.userPersonas?.user_personas?.length || 0, '个画像');
    console.log('   ⚠️  风险等级: 极高（Layer 1 红线警告）');
  } catch (error: any) {
    console.error('❌ 初始化失败:', error.message);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
