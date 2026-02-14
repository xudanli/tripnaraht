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
async function checkProgress() {
    const prisma = new client_1.PrismaClient();
    try {
        console.log('📊 知识库文件索引进度检查...\n');
        const indexedFiles = await prisma.knowledgeFile.findMany({
            select: {
                filename: true,
                filepath: true,
                category: true,
                _count: { select: { chunks: true } },
            },
            orderBy: { filepath: 'asc' },
        });
        const stats = {};
        indexedFiles.forEach(f => {
            const isOfficial = f.filepath.includes('official-sources');
            let region = 'other';
            if (f.filepath.includes('iceland'))
                region = 'iceland';
            else if (f.filepath.includes('svalbard'))
                region = 'svalbard';
            else if (f.filepath.includes('greenland'))
                region = 'greenland';
            else if (f.filepath.includes('faroe'))
                region = 'faroe-islands';
            else if (f.filepath.includes('alps'))
                region = 'alps';
            else if (f.filepath.includes('lofoten'))
                region = 'lofoten';
            if (!stats[region]) {
                stats[region] = { kb: [], official: [], kbChunks: 0, officialChunks: 0 };
            }
            if (isOfficial) {
                stats[region].official.push(f);
                stats[region].officialChunks += f._count.chunks;
            }
            else {
                stats[region].kb.push(f);
                stats[region].kbChunks += f._count.chunks;
            }
        });
        const docsDir = path.join(process.cwd(), 'docs');
        const regions = ['iceland', 'svalbard', 'greenland', 'faroe-islands', 'alps', 'lofoten'];
        const kbFiles = {};
        function findJsonFiles(dir, baseDir = '') {
            const files = [];
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                entries.forEach(entry => {
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.relative(baseDir || docsDir, fullPath);
                    if (entry.isDirectory() &&
                        !entry.name.startsWith('.') &&
                        !entry.name.includes('node_modules') &&
                        !entry.name.includes('official-sources')) {
                        files.push(...findJsonFiles(fullPath, baseDir || docsDir));
                    }
                    else if (entry.isFile() && entry.name.endsWith('.json')) {
                        files.push(relPath);
                    }
                });
            }
            catch (e) {
            }
            return files;
        }
        regions.forEach(region => {
            const regionDir = path.join(docsDir, region);
            if (fs.existsSync(regionDir)) {
                const jsonFiles = findJsonFiles(regionDir, docsDir);
                kbFiles[region] = jsonFiles.map(f => path.join(region, f));
            }
        });
        const kbIndexedFiles = indexedFiles.filter(f => !f.filepath.includes('official-sources'));
        const kbIndexedPaths = new Set();
        kbIndexedFiles.forEach(f => {
            var _a;
            let p = f.filepath.replace(/^docs\//, '');
            kbIndexedPaths.add(p);
            kbIndexedPaths.add(f.filename);
            const simplified = p.replace(new RegExp(`^${(_a = f.filepath.match(/(\w+)/)) === null || _a === void 0 ? void 0 : _a[1]}/`), '');
            if (simplified !== p) {
                kbIndexedPaths.add(simplified);
            }
        });
        const unindexed = {};
        Object.entries(kbFiles).forEach(([region, files]) => {
            const missing = files.filter(f => {
                if (kbIndexedPaths.has(f))
                    return false;
                const filename = f.split('/').pop() || '';
                if (kbIndexedPaths.has(filename))
                    return false;
                const simplified = f.replace(new RegExp(`^${region}/`), '');
                if (kbIndexedPaths.has(simplified))
                    return false;
                return true;
            });
            if (missing.length > 0) {
                unindexed[region] = missing;
            }
        });
        console.log('='.repeat(70));
        console.log('📊 知识库文件索引状态总览');
        console.log('='.repeat(70));
        console.log(`\n✅ 已索引文件总数: ${indexedFiles.length}`);
        console.log(`📦 总Chunks数: ${indexedFiles.reduce((sum, f) => sum + f._count.chunks, 0)}`);
        console.log(`\n📁 按区域和类型分布:\n`);
        let totalKbFiles = 0;
        let totalOfficialFiles = 0;
        let totalKbChunks = 0;
        let totalOfficialChunks = 0;
        regions.forEach(region => {
            var _a, _b;
            const stat = stats[region] || { kb: [], official: [], kbChunks: 0, officialChunks: 0 };
            const totalFiles = ((_a = kbFiles[region]) === null || _a === void 0 ? void 0 : _a.length) || 0;
            const indexedKbFiles = stat.kb.length;
            const unindexedCount = ((_b = unindexed[region]) === null || _b === void 0 ? void 0 : _b.length) || 0;
            const completionRate = totalFiles > 0 ? ((indexedKbFiles / totalFiles) * 100).toFixed(1) : 'N/A';
            if (stat.kb.length > 0 || stat.official.length > 0 || totalFiles > 0) {
                console.log(`${region.toUpperCase()}:`);
                console.log(`  知识库文件:`);
                console.log(`    - 总数: ${totalFiles}`);
                console.log(`    - 已索引: ${indexedKbFiles} (${completionRate}%)`);
                console.log(`    - 未索引: ${unindexedCount}`);
                console.log(`    - Chunks: ${stat.kbChunks}`);
                console.log(`  官方来源:`);
                console.log(`    - 文件数: ${stat.official.length}`);
                console.log(`    - Chunks: ${stat.officialChunks}`);
                console.log(`  小计: ${indexedKbFiles + stat.official.length}个文件, ${stat.kbChunks + stat.officialChunks}个chunks\n`);
                totalKbFiles += indexedKbFiles;
                totalOfficialFiles += stat.official.length;
                totalKbChunks += stat.kbChunks;
                totalOfficialChunks += stat.officialChunks;
            }
        });
        const totalKbFilesInDocs = Object.values(kbFiles).reduce((sum, files) => sum + files.length, 0);
        const totalUnindexed = Object.values(unindexed).reduce((sum, files) => sum + files.length, 0);
        const overallCompletionRate = totalKbFilesInDocs > 0
            ? ((totalKbFiles / totalKbFilesInDocs) * 100).toFixed(1)
            : 'N/A';
        console.log('='.repeat(70));
        console.log('📈 总体统计');
        console.log('='.repeat(70));
        console.log(`知识库JSON文件:`);
        console.log(`  - docs目录总数: ${totalKbFilesInDocs}`);
        console.log(`  - 已索引: ${totalKbFiles} (${overallCompletionRate}%)`);
        console.log(`  - 未索引: ${totalUnindexed}`);
        console.log(`  - 总Chunks: ${totalKbChunks}`);
        console.log(`\n官方来源:`);
        console.log(`  - 文件数: ${totalOfficialFiles}`);
        console.log(`  - 总Chunks: ${totalOfficialChunks}`);
        console.log(`\n总计:`);
        console.log(`  - 文件数: ${totalKbFiles + totalOfficialFiles}`);
        console.log(`  - 总Chunks: ${totalKbChunks + totalOfficialChunks}`);
        if (totalUnindexed > 0) {
            console.log(`\n⚠️  未索引的知识库文件详情:\n`);
            Object.entries(unindexed).forEach(([region, files]) => {
                if (files.length > 0) {
                    console.log(`${region}: ${files.length}个未索引`);
                    const displayFiles = files.slice(0, 10);
                    displayFiles.forEach(f => console.log(`  - ${f}`));
                    if (files.length > 10) {
                        console.log(`  ... 还有 ${files.length - 10} 个文件`);
                    }
                    console.log('');
                }
            });
        }
        console.log('\n✅ 检查完成！');
    }
    catch (error) {
        console.error('❌ 检查失败:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
checkProgress()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=check-kb-progress.js.map