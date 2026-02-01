// 检查知识库文件索引进度
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function checkProgress() {
  const prisma = new PrismaClient();

  try {
    console.log('📊 知识库文件索引进度检查...\n');

    // 1. 获取所有已索引文件
    const indexedFiles = await prisma.knowledgeFile.findMany({
      select: {
        filename: true,
        filepath: true,
        category: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { filepath: 'asc' },
    });

    // 2. 分类统计（区分知识库文件和官方来源）
    const stats: Record<string, { kb: any[], official: any[], kbChunks: number, officialChunks: number }> = {};

    indexedFiles.forEach(f => {
      const isOfficial = f.filepath.includes('official-sources');
      let region = 'other';
      
      if (f.filepath.includes('iceland')) region = 'iceland';
      else if (f.filepath.includes('svalbard')) region = 'svalbard';
      else if (f.filepath.includes('greenland')) region = 'greenland';
      else if (f.filepath.includes('faroe')) region = 'faroe-islands';
      else if (f.filepath.includes('alps')) region = 'alps';
      else if (f.filepath.includes('lofoten')) region = 'lofoten';

      if (!stats[region]) {
        stats[region] = { kb: [], official: [], kbChunks: 0, officialChunks: 0 };
      }

      if (isOfficial) {
        stats[region].official.push(f);
        stats[region].officialChunks += f._count.chunks;
      } else {
        stats[region].kb.push(f);
        stats[region].kbChunks += f._count.chunks;
      }
    });

    // 3. 检查docs目录下的实际JSON文件
    const docsDir = path.join(process.cwd(), 'docs');
    const regions = ['iceland', 'svalbard', 'greenland', 'faroe-islands', 'alps', 'lofoten'];
    const kbFiles: Record<string, string[]> = {};

    function findJsonFiles(dir: string, baseDir: string = ''): string[] {
      const files: string[] = [];
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
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(relPath);
          }
        });
      } catch (e) {
        // 忽略错误
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

    // 4. 对比已索引和未索引
    const kbIndexedFiles = indexedFiles.filter(f => !f.filepath.includes('official-sources'));
    // 创建索引路径集合（支持多种路径格式匹配）
    const kbIndexedPaths = new Set<string>();
    kbIndexedFiles.forEach(f => {
      // 移除 docs/ 前缀
      let p = f.filepath.replace(/^docs\//, '');
      kbIndexedPaths.add(p);
      // 也添加文件名匹配（因为有些文件可能路径不同但文件名相同）
      kbIndexedPaths.add(f.filename);
      // 如果路径包含重复的region名，也添加简化版本
      const simplified = p.replace(new RegExp(`^${f.filepath.match(/(\w+)/)?.[1]}/`), '');
      if (simplified !== p) {
        kbIndexedPaths.add(simplified);
      }
    });

    const unindexed: Record<string, string[]> = {};
    Object.entries(kbFiles).forEach(([region, files]) => {
      const missing = files.filter(f => {
        // 检查完整路径
        if (kbIndexedPaths.has(f)) return false;
        // 检查文件名
        const filename = f.split('/').pop() || '';
        if (kbIndexedPaths.has(filename)) return false;
        // 检查简化路径（移除重复的region前缀）
        const simplified = f.replace(new RegExp(`^${region}/`), '');
        if (kbIndexedPaths.has(simplified)) return false;
        return true;
      });
      if (missing.length > 0) {
        unindexed[region] = missing;
      }
    });

    // 5. 输出报告
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
      const stat = stats[region] || { kb: [], official: [], kbChunks: 0, officialChunks: 0 };
      const totalFiles = kbFiles[region]?.length || 0;
      const indexedKbFiles = stat.kb.length;
      const unindexedCount = unindexed[region]?.length || 0;
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

    // 6. 显示未索引文件详情（如果有）
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

  } catch (error: any) {
    console.error('❌ 检查失败:', error.message);
    throw error;
  } finally {
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
