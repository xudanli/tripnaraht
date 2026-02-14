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
async function runMigration() {
    var _a, _b, _c, _d;
    try {
        console.log('🚀 开始执行行程名称字段迁移...\n');
        const migrationFile = path.join(__dirname, '../prisma/migrations/20260204100007_add_trip_name_field/migration.sql');
        if (!fs.existsSync(migrationFile)) {
            throw new Error(`迁移文件不存在: ${migrationFile}`);
        }
        const sql = fs.readFileSync(migrationFile, 'utf-8');
        console.log('🔍 检查当前状态...\n');
        const columnExists = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'Trip' AND column_name = 'name'
    `;
        const hasColumn = Number(columnExists[0].count) > 0;
        if (hasColumn) {
            console.log('⚠️  name 字段已存在');
        }
        else {
            console.log('✓ name 字段不存在，将添加');
        }
        const totalTrips = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Trip"
    `;
        console.log(`📊 总行程数: ${Number(totalTrips[0].count)}`);
        let tripsWithoutName = 0;
        if (hasColumn) {
            const result = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NULL
      `;
            tripsWithoutName = Number(result[0].count);
            console.log(`📊 没有名称的行程数: ${tripsWithoutName}`);
        }
        else {
            console.log(`📊 没有名称的行程数: ${Number(totalTrips[0].count)} (字段不存在)`);
        }
        console.log('');
        console.log('🔧 执行迁移 SQL...\n');
        const lines = sql.split('\n');
        const statements = [];
        let currentStatement = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('--') || trimmed.length === 0) {
                continue;
            }
            currentStatement += line + '\n';
            if (trimmed.endsWith(';')) {
                const stmt = currentStatement.trim();
                if (stmt.length > 0 && !stmt.startsWith('--')) {
                    statements.push(stmt);
                }
                currentStatement = '';
            }
        }
        if (currentStatement.trim().length > 0) {
            statements.push(currentStatement.trim());
        }
        console.log(`找到 ${statements.length} 条 SQL 语句\n`);
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim().length === 0)
                continue;
            try {
                const preview = statement.substring(0, 100).replace(/\n/g, ' ').replace(/\s+/g, ' ');
                console.log(`执行语句 ${i + 1}/${statements.length}: ${preview}...`);
                await prisma.$executeRawUnsafe(statement);
                console.log(`  ✅ 完成\n`);
            }
            catch (error) {
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) ||
                    ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('duplicate')) ||
                    ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('column "name" of relation "Trip" already exists')) ||
                    ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('column "name" already exists'))) {
                    console.log(`  ⚠️  已存在，跳过: ${error.message.substring(0, 100)}\n`);
                    continue;
                }
                console.error(`  ❌ 执行失败: ${error.message}`);
                throw error;
            }
        }
        console.log('🔍 验证迁移结果...\n');
        const columnCheck = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'Trip' AND column_name = 'name'
    `;
        const fieldExists = Number(columnCheck[0].count) > 0;
        if (!fieldExists) {
            console.log('❌ 错误: name 字段未成功添加');
            throw new Error('迁移失败: name 字段未添加');
        }
        console.log('✅ name 字段已成功添加');
        const totalTripsAfter = await prisma.$queryRaw `
      SELECT COUNT(*) as count
      FROM "Trip"
    `;
        const totalCount = Number(totalTripsAfter[0].count);
        if (totalCount === 0) {
            console.log('📊 数据库中没有行程数据（这是正常的，如果是新数据库）');
        }
        else {
            const finalTripsWithoutName = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NULL
      `;
            const tripsWithName = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "Trip"
        WHERE "name" IS NOT NULL
      `;
            console.log(`📊 总行程数: ${totalCount}`);
            console.log(`📊 有名称的行程数: ${Number(tripsWithName[0].count)}`);
            console.log(`📊 没有名称的行程数: ${Number(finalTripsWithoutName[0].count)}`);
            if (Number(finalTripsWithoutName[0].count) === 0) {
                console.log('\n✅ 所有行程都有名称！');
            }
            else {
                console.log(`\n⚠️  仍有 ${Number(finalTripsWithoutName[0].count)} 个行程没有名称`);
            }
            if (Number(tripsWithName[0].count) > 0) {
                console.log('\n📋 示例数据:');
                const samples = await prisma.$queryRaw `
          SELECT "id", "name", "destination", "startDate"
          FROM "Trip"
          WHERE "name" IS NOT NULL
          LIMIT 5
        `;
                samples.forEach((trip) => {
                    console.log(`  - ${trip.name} (${trip.destination}, ${trip.startDate.toISOString().split('T')[0]})`);
                });
            }
        }
        console.log('\n🎉 迁移完成！');
        console.log('\n💡 提示: 如果需要标记迁移为已应用，可以执行:');
        console.log('   npx prisma migrate resolve --applied 20260204100007_add_trip_name_field');
    }
    catch (error) {
        console.error('\n❌ 迁移失败:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
runMigration()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=run-trip-name-migration.js.map