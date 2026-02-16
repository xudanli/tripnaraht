/**
 * 知识库路线导入脚本
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DOCS_ROOT = path.join(__dirname, '..', 'docs');

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
  'new-zealand-south-island': 'NZ',
};

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n=== 知识库路线导入 ===\n');
  if (isDryRun) console.log('模式: 仅检查\n');
  
  let found = 0, imported = 0, errors = 0;
  
  const destinations = fs.readdirSync(DOCS_ROOT).filter(d => {
    const p = path.join(DOCS_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });
  
  for (const dest of destinations) {
    const routesDir = path.join(DOCS_ROOT, dest, 'routes');
    if (!fs.existsSync(routesDir)) continue;
    
    const countryCode = COUNTRY_MAP[dest] || 'XX';
    console.log(`\n${dest} (${countryCode})`);
    
    const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const data = readJson(path.join(routesDir, file));
      if (!data) { errors++; continue; }
      
      found++;
      const routeId = path.basename(file, '.json');
      const routeName = data.route_name || data.name || routeId;
      const routeUuid = 'kb_' + dest + '_' + routeId;
      
      console.log('  ' + routeName);
      
      if (isDryRun) { imported++; continue; }
      
      try {
        const existing = await prisma.$queryRaw<any[]>`
          SELECT id FROM "RouteDirection" WHERE uuid = ${routeUuid}
        `;
        
        const metadata = JSON.stringify({
          knowledgeBase: data,
          source: file,
          route_basic_info: data.route_basic_info ?? undefined,
          roadType: data.route_basic_info?.road_type ?? undefined,
        });
        
        if (existing.length > 0) {
          await prisma.$executeRaw`
            UPDATE "RouteDirection"
            SET metadata = ${metadata}::jsonb, "updatedAt" = NOW()
            WHERE uuid = ${routeUuid}
          `;
          console.log('    -> 更新');
        } else {
          const seasonality = JSON.stringify({ bestMonths: data.best_seasons || [] });
          const riskProfile = JSON.stringify({ overallLevel: data.risk_level || 'medium' });
          const itinerary = JSON.stringify({
            durationDays: data.duration_days || null,
            distanceKm: data.total_distance_km || null,
          });
          
          await prisma.$executeRaw`
            INSERT INTO "RouteDirection" (
              uuid, "countryCode", name, "nameCN", "nameEN",
              description, tags, regions,
              seasonality, "riskProfile", "itinerarySkeleton",
              metadata, "isActive", "createdAt", "updatedAt", status
            ) VALUES (
              ${routeUuid}, ${countryCode}, ${routeName},
              ${data.route_name_cn || routeName},
              ${data.route_name_en || routeName},
              ${data.description || ''},
              '{}'::text[], ${'{' + dest + '}'}::text[],
              ${seasonality}::jsonb, ${riskProfile}::jsonb, ${itinerary}::jsonb,
              ${metadata}::jsonb, true, NOW(), NOW(), 'active'
            )
          `;
          console.log('    -> 导入');
        }
        imported++;
      } catch (err: any) {
        console.log('    -> 错误: ' + err.message.slice(0, 50));
        errors++;
      }
    }
  }
  
  console.log('\n统计: 发现 ' + found + ', 处理 ' + imported + ', 错误 ' + errors + '\n');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());

export {};
