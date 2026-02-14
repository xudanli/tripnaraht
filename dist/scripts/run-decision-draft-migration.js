"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function runMigration() {
    const prisma = new client_1.PrismaClient();
    try {
        console.log('🚀 开始执行 Decision Draft 表迁移...\n');
        const sqlPath = path.join(process.cwd(), 'prisma/migrations/add_decision_draft_tables.sql');
        if (!fs.existsSync(sqlPath)) {
            console.error(`❌ 错误: 迁移文件不存在: ${sqlPath}`);
            process.exit(1);
        }
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log(`📝 读取迁移文件: ${sqlPath}\n`);
        const statements = [];
        let currentStatement = '';
        let inDollarQuote = false;
        let dollarTag = '';
        const lines = sql.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('--') || trimmed.length === 0) {
                continue;
            }
            currentStatement += line + '\n';
            if (!inDollarQuote && trimmed.includes('$$')) {
                const match = trimmed.match(/\$(\w*)\$/);
                if (match) {
                    inDollarQuote = true;
                    dollarTag = match[1];
                }
            }
            if (inDollarQuote && trimmed.includes(`$$${dollarTag}$$`)) {
                inDollarQuote = false;
                dollarTag = '';
            }
            if (!inDollarQuote && trimmed.endsWith(';')) {
                const stmt = currentStatement.trim();
                if (stmt.length > 0) {
                    statements.push(stmt);
                }
                currentStatement = '';
            }
        }
        if (currentStatement.trim().length > 0) {
            statements.push(currentStatement.trim());
        }
        console.log(`📝 找到 ${statements.length} 条 SQL 语句\n`);
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim().length === 0)
                continue;
            try {
                console.log(`执行语句 ${i + 1}/${statements.length}...`);
                const cleanStatement = statement.replace(/;$/, '');
                if (cleanStatement.includes('$$')) {
                    await prisma.$queryRawUnsafe(cleanStatement);
                }
                else {
                    await prisma.$executeRawUnsafe(cleanStatement);
                }
                console.log(`✅ 语句 ${i + 1} 执行成功\n`);
            }
            catch (error) {
                const errorMsg = error.message || '';
                if (errorMsg.includes('already exists') ||
                    errorMsg.includes('duplicate') ||
                    errorMsg.includes('relation already exists') ||
                    errorMsg.includes('already defined')) {
                    console.log(`⚠️  语句 ${i + 1} 已存在，跳过\n`);
                    continue;
                }
                console.error(`❌ 语句 ${i + 1} 执行失败:`, errorMsg);
                console.error(`SQL 预览: ${statement.substring(0, 150)}...\n`);
            }
        }
        console.log('✅ 迁移完成！\n');
        const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('decision_drafts', 'decision_steps', 'decision_draft_versions')`);
        console.log('📊 验证表结构:');
        if (tables.length === 0) {
            console.log('  ⚠️  未找到任何表');
        }
        else {
            tables.forEach((t) => {
                console.log(`  ✅ ${t.tablename}`);
            });
        }
        if (tables.length < 3) {
            console.log('\n⚠️  警告: 部分表可能未创建成功，请检查错误日志');
        }
        else {
            console.log('\n🎉 所有表创建成功！');
        }
    }
    catch (error) {
        console.error('❌ 迁移失败:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
runMigration()
    .then(() => {
    console.log('\n✅ 迁移脚本执行完成');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ 迁移脚本执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=run-decision-draft-migration.js.map