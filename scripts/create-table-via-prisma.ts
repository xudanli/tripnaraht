// scripts/create-table-via-prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('创建目的地澄清配置表...');
  
  try {
    // 使用 Prisma 的 $executeRaw 执行 SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS destination_clarification_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        destination_code VARCHAR(2) UNIQUE NOT NULL,
        destination_name VARCHAR(255) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT false,
        config JSONB NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        updated_by VARCHAR(255)
      );
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_destination_code 
      ON destination_clarification_configs(destination_code);
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_enabled 
      ON destination_clarification_configs(enabled);
    `;
    
    console.log('✅ 表已创建');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('✅ 表已存在');
    } else {
      console.error('❌ 创建表失败:', error.message);
      throw error;
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
