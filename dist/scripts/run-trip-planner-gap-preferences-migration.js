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
const prisma = new client_1.PrismaClient();
async function executeSqlStatements(sql, description) {
    var _a;
    console.log(`📋 ${description}...`);
    const tableName = description.includes('preferences') ? 'trip_planner_gap_preferences' : 'trip_planner_ignored_gaps';
    const tableExists = await prisma.$queryRaw `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) as exists
  `;
    if ((_a = tableExists[0]) === null || _a === void 0 ? void 0 : _a.exists) {
        console.log(`  ⚠️  表 ${tableName} 已存在，跳过创建`);
        console.log('   如需重新创建，请先删除现有表\n');
        return;
    }
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
    console.log(`  找到 ${statements.length} 条 SQL 语句\n`);
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim().length === 0 || statement.trim() === ';') {
            continue;
        }
        try {
            const preview = statement.substring(0, 50).replace(/\n/g, ' ');
            console.log(`  [${i + 1}/${statements.length}] 执行: ${preview}...`);
            await prisma.$executeRawUnsafe(statement);
            console.log(`    ✅ 成功\n`);
        }
        catch (error) {
            if (error.message.includes('already exists') ||
                error.message.includes('duplicate') ||
                error.message.includes('relation') && error.message.includes('already exists')) {
                console.log(`    ⚠️  已存在，跳过\n`);
            }
            else {
                if (statement.toUpperCase().includes('COMMENT') &&
                    error.message.includes('does not exist')) {
                    console.log(`    ⚠️  表不存在，跳过 COMMENT\n`);
                }
                else {
                    console.error(`    ❌ 失败: ${error.message.substring(0, 150)}\n`);
                }
            }
        }
    }
}
async function runMigration() {
    console.log('🚀 开始执行规划助手缺口偏好表迁移...\n');
    try {
        const preferencesSqlPath = path.join(process.cwd(), 'prisma/migrations/add_trip_planner_gap_preferences.sql');
        const ignoredGapsSqlPath = path.join(process.cwd(), 'prisma/migrations/add_trip_planner_ignored_gaps.sql');
        if (!fs.existsSync(preferencesSqlPath)) {
            console.error(`❌ 错误: 迁移文件不存在: ${preferencesSqlPath}`);
            process.exit(1);
        }
        if (!fs.existsSync(ignoredGapsSqlPath)) {
            console.error(`❌ 错误: 迁移文件不存在: ${ignoredGapsSqlPath}`);
            process.exit(1);
        }
        console.log(`📝 读取迁移文件: ${preferencesSqlPath}`);
        console.log(`📝 读取迁移文件: ${ignoredGapsSqlPath}\n`);
        const preferencesSql = fs.readFileSync(preferencesSqlPath, 'utf-8');
        const ignoredGapsSql = fs.readFileSync(ignoredGapsSqlPath, 'utf-8');
        await executeSqlStatements(preferencesSql, '创建 trip_planner_gap_preferences 表');
        await executeSqlStatements(ignoredGapsSql, '创建 trip_planner_ignored_gaps 表');
        console.log('\n✅ 迁移完成！');
        console.log('\n📊 创建的表：');
        console.log('  - trip_planner_gap_preferences（缺口偏好表）');
        console.log('  - trip_planner_ignored_gaps（忽略缺口表）');
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
runMigration();
//# sourceMappingURL=run-trip-planner-gap-preferences-migration.js.map