/**
 * 知识库风险规则导入脚本
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DOCS_ROOT = path.join(__dirname, '..', 'docs');

const COUNTRY_MAP: Record<string, string> = {
  'iceland': 'IS', 'svalbard': 'SJ', 'greenland': 'GL',
  'faroe-islands': 'FO', 'lofoten-islands': 'NO', 'alps': 'CH',
  'argentina': 'AR', 'patagonia': 'CL', 'tibet': 'CN',
  'new-zealand-south-island': 'NZ',
};

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function extractRisks(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data.risks && Array.isArray(data.risks)) return data.risks;
  if (data.weather_risks && Array.isArray(data.weather_risks)) return data.weather_risks;
  if (data.terrain_risks && Array.isArray(data.terrain_risks)) return data.terrain_risks;
  if (data.safety_alerts && Array.isArray(data.safety_alerts)) return data.safety_alerts;
  // 单个风险对象
  if (data.risk_id || data.risk_type || data.severity || data.level) return [data];
  return [];
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n=== 知识库风险规则导入 ===\n');
  if (isDryRun) console.log('模式: 仅检查\n');
  
  let found = 0, imported = 0, skipped = 0, errors = 0;
  
  const destinations = fs.readdirSync(DOCS_ROOT).filter(d => {
    const p = path.join(DOCS_ROOT, d);
    return fs.statSync(p).isDirectory() && !d.startsWith('.');
  });
  
  for (const dest of destinations) {
    const risksDir = path.join(DOCS_ROOT, dest, 'risks');
    if (!fs.existsSync(risksDir)) continue;
    
    const countryCode = COUNTRY_MAP[dest] || 'XX';
    console.log(`\n${dest} (${countryCode})`);
    
    const files = fs.readdirSync(risksDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const data = readJson(path.join(risksDir, file));
      if (!data) { errors++; continue; }
      
      const riskType = path.basename(file, '.json').toUpperCase().replace(/-/g, '_');
      const risks = extractRisks(data);
      
      if (risks.length === 0) {
        console.log(`  ${file}: 无有效规则`);
        continue;
      }
      
      console.log(`  ${file}: ${risks.length} 条规则`);
      found += risks.length;
      
      if (isDryRun) {
        imported += risks.length;
        continue;
      }
      
      for (const risk of risks) {
        const riskName = risk.name || risk.risk_id || risk.risk_type || riskType;
        const zoneId = ('kb_' + dest + '_' + riskName).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
        
        try {
          const existing = await prisma.$queryRaw<any[]>`
            SELECT id FROM hazard_zones WHERE zone_id = ${zoneId}
          `;
          
          if (existing.length === 0) {
            await prisma.$executeRaw`
              INSERT INTO hazard_zones (
                id, zone_id, type, country_code, level,
                seasonality, metadata, description, updated_at
              ) VALUES (
                gen_random_uuid(),
                ${zoneId},
                ${risk.risk_type || riskType},
                ${countryCode},
                ${risk.severity || risk.level || 'MEDIUM'},
                ${JSON.stringify(risk.affected_seasons || risk.seasonal_risk || {})}::jsonb,
                ${JSON.stringify({ ...risk, source: file, destination: dest })}::jsonb,
                ${risk.description || riskName},
                NOW()
              )
            `;
            imported++;
          } else {
            skipped++;
          }
        } catch (err: any) {
          errors++;
        }
      }
    }
  }
  
  console.log('\n统计: 发现 ' + found + ', 导入 ' + imported + ', 跳过 ' + skipped + ', 错误 ' + errors + '\n');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());

export {};
