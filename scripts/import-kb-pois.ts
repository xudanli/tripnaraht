/**
 * 知识库 POI 导入脚本
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DOCS_ROOT = path.join(__dirname, '..', 'docs');

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n=== 知识库 POI 导入 ===\n');
  if (isDryRun) console.log('模式: 仅检查\n');
  
  let found = 0, imported = 0, updated = 0, errors = 0;
  
  const destinations = fs.readdirSync(DOCS_ROOT).filter(d => {
    const p = path.join(DOCS_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });
  
  for (const dest of destinations) {
    const poisDir = path.join(DOCS_ROOT, dest, 'pois');
    if (!fs.existsSync(poisDir)) continue;
    
    console.log(`\n${dest}`);
    
    const files = fs.readdirSync(poisDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const data = readJson(path.join(poisDir, file));
      if (!data) { errors++; continue; }
      
      // 提取 POI 数组 - 处理各种可能的数据结构
      let pois: any[] = [];
      if (Array.isArray(data)) {
        pois = data;
      } else if (data.attractions && Array.isArray(data.attractions)) {
        pois = data.attractions;
      } else if (data.pois && Array.isArray(data.pois)) {
        pois = data.pois;
      } else if (data.places && Array.isArray(data.places)) {
        pois = data.places;
      } else if (data.name || data.poi_name) {
        pois = [data];
      }
      
      if (pois.length === 0) {
        console.log(`  ${file}: 无有效 POI`);
        continue;
      }
      
      console.log(`  ${file}: ${pois.length} 个 POI`);
      found += pois.length;
      
      if (isDryRun) {
        imported += pois.length;
        continue;
      }
      
      for (const poi of pois) {
        const name = poi.name || poi.poi_name || poi.attraction_name;
        if (!name) continue;
        
        try {
          // 检查是否存在
          const existing = await prisma.place.findFirst({
            where: { nameEN: name },
          });
          
          if (existing) {
            // 更新 metadata
            const currentMeta = (existing.metadata as any) || {};
            await prisma.place.update({
              where: { id: existing.id },
              data: {
                metadata: {
                  ...currentMeta,
                  knowledgeBase: {
                    destination: dest,
                    source: file,
                    ...poi,
                  },
                },
              },
            });
            updated++;
          } else {
            // 如果有坐标，创建新记录
            const coords = poi.coordinates || poi.location;
            if (coords) {
              const lat = coords.latitude || coords.lat;
              const lng = coords.longitude || coords.lng || coords.lon;
              
              if (lat && lng) {
                await prisma.$executeRaw`
                  INSERT INTO "Place" (
                    id, uuid, "nameEN", "nameCN", category,
                    location, metadata, "physicalMetadata",
                    "createdAt", "updatedAt"
                  ) VALUES (
                    gen_random_uuid(),
                    gen_random_uuid()::text,
                    ${name},
                    ${poi.name_cn || poi.chinese_name || name},
                    'ATTRACTION',
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                    ${JSON.stringify({ knowledgeBase: { destination: dest, ...poi } })}::jsonb,
                    ${JSON.stringify({
                      base_fatigue_score: 5,
                      terrain_type: poi.terrain_type || 'MIXED',
                      estimated_duration_min: 60,
                    })}::jsonb,
                    NOW(), NOW()
                  )
                `;
                imported++;
              }
            }
          }
        } catch (err: any) {
          errors++;
        }
      }
    }
  }
  
  console.log('\n统计: 发现 ' + found + ', 导入 ' + imported + ', 更新 ' + updated + ', 错误 ' + errors + '\n');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());

export {};
