#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('='.repeat(60));
    console.log('创建打包清单模板表');
    console.log('='.repeat(60));
    console.log('');
    try {
        console.log('📋 创建 packing_checklist_templates 表...');
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "packing_checklist_templates" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "version" VARCHAR(50) NOT NULL,
        "last_updated" TIMESTAMP(3) NOT NULL,
        "template_data" JSONB NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('  ✅ packing_checklist_templates 表创建成功');
        console.log('📋 创建 packing_guides 表...');
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "packing_guides" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "version" VARCHAR(50) NOT NULL,
        "last_updated" TIMESTAMP(3) NOT NULL,
        "guide_data" JSONB NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('  ✅ packing_guides 表创建成功');
        console.log('📋 创建索引...');
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "packing_checklist_templates_version_idx" 
      ON "packing_checklist_templates"("version");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "packing_checklist_templates_is_active_idx" 
      ON "packing_checklist_templates"("is_active");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "packing_guides_version_idx" 
      ON "packing_guides"("version");
    `);
        await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "packing_guides_is_active_idx" 
      ON "packing_guides"("is_active");
    `);
        console.log('  ✅ 索引创建成功');
        console.log('');
        console.log('='.repeat(60));
        console.log('✅ 所有表创建完成');
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ 创建失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=create-packing-tables.js.map