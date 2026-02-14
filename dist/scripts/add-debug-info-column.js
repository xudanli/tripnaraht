"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
async function addDebugInfoColumn() {
    const prisma = new client_1.PrismaClient();
    try {
        console.log('🚀 开始添加 debug_info 字段...\n');
        const checkColumn = await prisma.$queryRawUnsafe(`SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = 'decision_drafts' 
       AND column_name = 'debug_info'`);
        if (checkColumn.length > 0) {
            console.log('✅ debug_info 字段已存在，跳过添加\n');
            return;
        }
        await prisma.$executeRawUnsafe(`ALTER TABLE decision_drafts ADD COLUMN debug_info JSONB`);
        console.log('✅ debug_info 字段添加成功！\n');
        const verifyColumn = await prisma.$queryRawUnsafe(`SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = 'decision_drafts' 
       AND column_name = 'debug_info'`);
        if (verifyColumn.length > 0) {
            console.log('✅ 验证成功：debug_info 字段已添加到 decision_drafts 表\n');
        }
        else {
            console.log('⚠️  警告：验证失败，字段可能未成功添加\n');
        }
    }
    catch (error) {
        console.error('❌ 添加字段失败:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
addDebugInfoColumn()
    .then(() => {
    console.log('✅ 脚本执行完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=add-debug-info-column.js.map