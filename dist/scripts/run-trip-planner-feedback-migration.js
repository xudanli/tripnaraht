#!/usr/bin/env ts-node
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
    var _a, _b, _c, _d, _e, _f;
    const prisma = new client_1.PrismaClient();
    try {
        console.log('🚀 开始执行规划助手反馈表迁移...\n');
        const sqlPath = path.join(process.cwd(), 'prisma/migrations/add_trip_planner_feedback.sql');
        if (!fs.existsSync(sqlPath)) {
            console.error(`❌ 错误: 迁移文件不存在: ${sqlPath}`);
            process.exit(1);
        }
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        console.log(`📝 读取迁移文件: ${sqlPath}\n`);
        const tableExists = await prisma.$queryRaw `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'trip_planner_feedback'
      ) as exists
    `;
        if ((_a = tableExists[0]) === null || _a === void 0 ? void 0 : _a.exists) {
            console.log('⚠️  表 trip_planner_feedback 已存在，跳过创建');
            console.log('   如需重新创建，请先删除现有表\n');
            return;
        }
        console.log('🔧 执行 SQL 迁移...\n');
        const lines = sql.split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
        });
        let currentStatement = '';
        const statements = [];
        for (const line of lines) {
            currentStatement += line + '\n';
            if (line.trim().endsWith(';')) {
                statements.push(currentStatement.trim());
                currentStatement = '';
            }
        }
        if (currentStatement.trim().length > 0) {
            statements.push(currentStatement.trim());
        }
        console.log(`找到 ${statements.length} 条 SQL 语句\n`);
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim().length === 0 || statement.trim() === ';') {
                continue;
            }
            try {
                const preview = statement.substring(0, 50).replace(/\n/g, ' ');
                console.log(`执行语句 ${i + 1}/${statements.length}: ${preview}...`);
                await prisma.$executeRawUnsafe(statement);
                console.log(`  ✅ 完成\n`);
            }
            catch (error) {
                if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('already exists')) ||
                    ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('duplicate')) ||
                    ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('relation')) && ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('does not exist')) && statement.includes('COMMENT')) {
                    console.log(`  ⚠️  跳过: ${error.message}\n`);
                    continue;
                }
                if (((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('does not exist')) && statement.includes('COMMENT')) {
                    console.log(`  ⚠️  表不存在，跳过 COMMENT: ${error.message}\n`);
                    continue;
                }
                throw error;
            }
        }
        console.log('✅ 迁移执行成功！\n');
        console.log('🔍 验证表结构...\n');
        const columns = await prisma.$queryRaw `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trip_planner_feedback'
      ORDER BY ordinal_position
    `;
        console.log('表结构:');
        columns.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
        });
        console.log('\n✅ 迁移完成！');
    }
    catch (error) {
        console.error('\n❌ 迁移失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
runMigration().catch(console.error);
//# sourceMappingURL=run-trip-planner-feedback-migration.js.map