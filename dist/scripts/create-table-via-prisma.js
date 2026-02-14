"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    var _a;
    console.log('创建目的地澄清配置表...');
    try {
        await prisma.$executeRaw `
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
        await prisma.$executeRaw `
      CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_destination_code 
      ON destination_clarification_configs(destination_code);
    `;
        await prisma.$executeRaw `
      CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_enabled 
      ON destination_clarification_configs(enabled);
    `;
        console.log('✅ 表已创建');
    }
    catch (error) {
        if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) {
            console.log('✅ 表已存在');
        }
        else {
            console.error('❌ 创建表失败:', error.message);
            throw error;
        }
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=create-table-via-prisma.js.map