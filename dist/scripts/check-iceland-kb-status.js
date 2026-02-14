#!/usr/bin/env tsx
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    var _a, _b, _c;
    console.log('='.repeat(60));
    console.log('冰岛知识库导入状态检查');
    console.log('='.repeat(60));
    console.log('');
    try {
        console.log('📊 检查数据库表...');
        try {
            const kbCount = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "KnowledgeBase"
        WHERE country_code = 'IS'
      `;
            console.log('  ✅ KnowledgeBase 表存在');
            console.log(`  冰岛知识库文档数: ${((_a = kbCount[0]) === null || _a === void 0 ? void 0 : _a.count) || 0}`);
        }
        catch (error) {
            if (error.code === 'P2021' || error.message.includes('does not exist')) {
                console.log('  ⚠️  KnowledgeBase 表不存在，需要运行迁移');
            }
            else {
                throw error;
            }
        }
        try {
            const chunkCount = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "KnowledgeChunk" kc
        JOIN "KnowledgeBase" kb ON kc.knowledge_base_id = kb.id
        WHERE kb.country_code = 'IS'
      `;
            console.log('  ✅ KnowledgeChunk 表存在');
            console.log(`  冰岛知识块数: ${((_b = chunkCount[0]) === null || _b === void 0 ? void 0 : _b.count) || 0}`);
        }
        catch (error) {
            if (error.code === 'P2021' || error.message.includes('does not exist')) {
                console.log('  ⚠️  KnowledgeChunk 表不存在，需要运行迁移');
            }
            else {
                throw error;
            }
        }
        console.log('');
        console.log('📁 检查源文件...');
        const docsPath = path.join(process.cwd(), 'docs/iceland');
        if (!fs.existsSync(docsPath)) {
            console.log(`  ❌ 文档目录不存在: ${docsPath}`);
            return;
        }
        const categories = {
            pois: ['attractions.json', 'accommodations.json', 'services.json', 'supplies.json'],
            routes: ['golden-circle.json', 'ring-road-south.json', 'snaefellsnes.json', 'highlands.json', 'ring-road-full.json', 'westfjords.json'],
            geography: ['climate.json', 'terrain.json', 'seasonal-features.json'],
            risks: ['weather-risks.json', 'safety-alerts.json', 'accessibility.json', 'terrain-risks.json'],
            practical: ['car-rental-guide.json', 'local-rules.json', 'packing-guide.json'],
            'decision-support': ['user-personas.json', 'feasibility-matrix.json', 'rhythm-patterns.json'],
        };
        let totalFiles = 0;
        let existingFiles = 0;
        for (const [category, files] of Object.entries(categories)) {
            const categoryPath = path.join(docsPath, category);
            console.log(`\n  📂 ${category}/`);
            for (const file of files) {
                const filePath = path.join(categoryPath, file);
                totalFiles++;
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    console.log(`    ✅ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
                    existingFiles++;
                }
                else {
                    console.log(`    ❌ ${file} (缺失)`);
                }
            }
        }
        console.log('');
        console.log(`  总计: ${existingFiles}/${totalFiles} 个文件存在`);
        console.log('');
        console.log('📚 检查旧的 DocumentIndex 表...');
        try {
            const oldDocs = await prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM "DocumentIndex"
        WHERE metadata->>'countryCode' = 'IS'
      `;
            console.log(`  冰岛文档数: ${((_c = oldDocs[0]) === null || _c === void 0 ? void 0 : _c.count) || 0}`);
        }
        catch (error) {
            if (error.code === 'P2021' || error.message.includes('does not exist')) {
                console.log('  ⚠️  DocumentIndex 表不存在（这是正常的，新系统使用 KnowledgeBase）');
            }
            else {
                console.log(`  ⚠️  查询失败: ${error.message}`);
            }
        }
        console.log('');
        console.log('='.repeat(60));
        console.log('💡 建议操作:');
        console.log('='.repeat(60));
        console.log('');
        console.log('1️⃣  如果知识库表不存在，运行迁移:');
        console.log('   npx tsx scripts/setup-knowledge-base-tables.ts');
        console.log('');
        console.log('2️⃣  索引冰岛知识库:');
        console.log('   npx tsx scripts/index-iceland-knowledge-base.ts');
        console.log('');
        console.log('3️⃣  测试检索功能:');
        console.log('   curl -X POST http://localhost:3000/rag/chunks/retrieve \\');
        console.log('     -H "Content-Type: application/json" \\');
        console.log('     -d \'{"query": "冰岛租车", "countryCode": "IS", "limit": 5}\'');
        console.log('');
    }
    catch (error) {
        console.error('❌ 错误:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=check-iceland-kb-status.js.map