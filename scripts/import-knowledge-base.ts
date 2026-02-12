/**
 * TripNARA 知识库导入主脚本
 * 
 * 将 docs 文件夹中的知识库数据导入数据库
 * 
 * 使用方法：
 *   npx ts-node scripts/import-knowledge-base.ts              # 导入所有
 *   npx ts-node scripts/import-knowledge-base.ts --dry-run    # 仅检查
 *   npx ts-node scripts/import-knowledge-base.ts --routes     # 仅导入路线
 *   npx ts-node scripts/import-knowledge-base.ts --risks      # 仅导入风险
 *   npx ts-node scripts/import-knowledge-base.ts --pois       # 仅导入 POI
 *   npx ts-node scripts/import-knowledge-base.ts --status     # 查看状态
 * 
 * 子脚本：
 *   npx ts-node scripts/import-kb-routes.ts
 *   npx ts-node scripts/import-kb-risks.ts
 *   npx ts-node scripts/import-kb-pois.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const DOCS_ROOT = path.join(__dirname, '..', 'docs');

// 目的地到国家代码映射
const COUNTRY_MAP: Record<string, string> = {
  'iceland': 'IS',
  'svalbard': 'SJ',
  'greenland': 'GL',
  'faroe-islands': 'FO',
  'lofoten-islands': 'NO',
  'alps': 'CH',
  'argentina': 'AR',
  'patagonia': 'CL',
  'tibet': 'CN',
  'qinghai-gansu': 'CN',
  'xinjiang': 'CN',
  'sichuan-yunnan': 'CN',
  'inner-mongolia': 'CN',
  'new-zealand-south-island': 'NZ',
  'namibia': 'NA',
  'nepal': 'NP',
};

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 显示知识库导入状态
 */
async function showStatus(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         TripNARA 知识库状态                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // 路线数据
  const routes = await prisma.$queryRaw<any[]>`
    SELECT "countryCode", COUNT(*) as cnt
    FROM "RouteDirection"
    WHERE uuid LIKE 'kb_%'
    GROUP BY "countryCode"
    ORDER BY cnt DESC
  `;
  
  const routeTotal = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as cnt FROM "RouteDirection" WHERE uuid LIKE 'kb_%'
  `;
  
  console.log('📍 知识库路线:');
  routes.forEach((r: any) => console.log(`   ${r.countryCode}: ${r.cnt} 条`));
  console.log(`   ──────────────`);
  console.log(`   总计: ${routeTotal[0].cnt} 条\n`);
  
  // 风险数据
  const hazards = await prisma.$queryRaw<any[]>`
    SELECT country_code, COUNT(*) as cnt
    FROM hazard_zones
    WHERE zone_id LIKE 'kb_%'
    GROUP BY country_code
    ORDER BY cnt DESC
  `;
  
  const hazardTotal = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as cnt FROM hazard_zones WHERE zone_id LIKE 'kb_%'
  `;
  
  console.log('⚠️  知识库风险规则:');
  hazards.forEach((h: any) => console.log(`   ${h.country_code}: ${h.cnt} 条`));
  console.log(`   ──────────────`);
  console.log(`   总计: ${hazardTotal[0].cnt} 条\n`);
  
  // 知识库增强的 POI
  const enhancedPois = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as cnt FROM "Place" 
    WHERE metadata->>'knowledgeBase' IS NOT NULL
  `;
  console.log(`📌 知识库增强 POI: ${enhancedPois[0].cnt} 条\n`);
  
  // 原有数据对比
  const originalRoutes = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as cnt FROM "RouteDirection" WHERE uuid NOT LIKE 'kb_%'
  `;
  const places = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM "Place"`;
  const allHazards = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM hazard_zones`;
  
  console.log('📊 数据库总量:');
  console.log(`   路线总数: ${Number(routeTotal[0].cnt) + Number(originalRoutes[0].cnt)} (原有 ${originalRoutes[0].cnt} + 知识库 ${routeTotal[0].cnt})`);
  console.log(`   POI 总数: ${places[0].cnt}`);
  console.log(`   风险规则: ${allHazards[0].cnt}`);
  
  // 知识库目录统计
  const destinations = fs.readdirSync(DOCS_ROOT).filter(d => {
    const p = path.join(DOCS_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });
  
  console.log(`\n📁 知识库目的地: ${destinations.length} 个`);
  
  let totalFiles = 0;
  for (const dest of destinations) {
    const destPath = path.join(DOCS_ROOT, dest);
    const countFiles = (dir: string): number => {
      let count = 0;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          count += countFiles(itemPath);
        } else if (item.endsWith('.json') || item.endsWith('.md')) {
          count++;
        }
      }
      return count;
    };
    totalFiles += countFiles(destPath);
  }
  console.log(`   知识库文件: ${totalFiles} 个\n`);
}

/**
 * 运行子脚本
 */
function runSubScript(script: string, dryRun: boolean): void {
  const dryRunArg = dryRun ? ' --dry-run' : '';
  try {
    execSync(`npx ts-node ${script}${dryRunArg}`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
  } catch (error) {
    console.error(`脚本执行失败: ${script}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const onlyStatus = args.includes('--status');
  const onlyRoutes = args.includes('--routes');
  const onlyRisks = args.includes('--risks');
  const onlyPois = args.includes('--pois');
  
  if (onlyStatus) {
    await showStatus();
    return;
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         TripNARA 知识库导入工具                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查 (--dry-run)\n');
  } else {
    console.log('⚠️  运行模式: 实际导入数据\n');
  }
  
  const runAll = !onlyRoutes && !onlyRisks && !onlyPois;
  
  if (runAll || onlyRoutes) {
    console.log('═══ 导入路线数据 ═══');
    runSubScript('scripts/import-kb-routes.ts', isDryRun);
  }
  
  if (runAll || onlyRisks) {
    console.log('\n═══ 导入风险规则 ═══');
    runSubScript('scripts/import-kb-risks.ts', isDryRun);
  }
  
  if (runAll || onlyPois) {
    console.log('\n═══ 导入 POI 数据 ═══');
    runSubScript('scripts/import-kb-pois.ts', isDryRun);
  }
  
  // 显示最终状态
  console.log('\n');
  await showStatus();
}

main()
  .catch((e) => {
    console.error('❌ 脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export {};
