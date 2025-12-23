#!/usr/bin/env ts-node

/**
 * 新西兰 OSM POI 数据抓取脚本
 * 
 * 使用方法：
 *   ts-node scripts/fetch-osm-poi-newzealand.ts [--phase1|--phase2|--all|--region=REGION_KEY]
 * 
 * 示例：
 *   ts-node scripts/fetch-osm-poi-newzealand.ts --phase1
 *   ts-node scripts/fetch-osm-poi-newzealand.ts --region=NZ_AUCKLAND
 *   ts-node scripts/fetch-osm-poi-newzealand.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// ============================================
// 区域配置
// ============================================

interface RegionConfig {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // 米
  phase: 1 | 2;
}

const NZ_REGIONS: RegionConfig[] = [
  // Phase 1: MVP（覆盖 80% 行程）
  // 北岛
  { key: 'NZ_AUCKLAND', name: 'Auckland', lat: -36.8485, lng: 174.7633, radius: 50000, phase: 1 },
  { key: 'NZ_WELLINGTON', name: 'Wellington', lat: -41.2865, lng: 174.7762, radius: 50000, phase: 1 },
  { key: 'NZ_ROTORUA', name: 'Rotorua', lat: -38.1368, lng: 176.2497, radius: 80000, phase: 1 },
  { key: 'NZ_TAUPO_TONGARIRO', name: 'Taupo & Tongariro', lat: -39.0292, lng: 175.8784, radius: 120000, phase: 1 },
  
  // 南岛
  { key: 'NZ_CHRISTCHURCH', name: 'Christchurch', lat: -43.5321, lng: 172.6362, radius: 50000, phase: 1 },
  { key: 'NZ_QUEENSTOWN', name: 'Queenstown', lat: -45.0312, lng: 168.6626, radius: 80000, phase: 1 },
  { key: 'NZ_WANAKA', name: 'Wanaka', lat: -44.6939, lng: 169.1318, radius: 80000, phase: 1 },
  { key: 'NZ_TEKAPO_MTCOOK', name: 'Tekapo & Mt Cook', lat: -43.8878, lng: 170.5103, radius: 150000, phase: 1 },
  { key: 'NZ_TE_ANU_MILFORD', name: 'Te Anau & Milford Sound', lat: -45.4150, lng: 167.7183, radius: 200000, phase: 1 },
  { key: 'NZ_FRANZ_JOSEF', name: 'Franz Josef Glacier', lat: -43.3891, lng: 170.1819, radius: 120000, phase: 1 },
  { key: 'NZ_DUNEDIN', name: 'Dunedin', lat: -45.8741, lng: 170.5036, radius: 50000, phase: 1 },
  
  // Phase 2: 增强（更偏远/更硬核）
  { key: 'NZ_NELSON_ABEL_TASMAN', name: 'Nelson & Abel Tasman', lat: -41.2706, lng: 173.2840, radius: 80000, phase: 2 },
  { key: 'NZ_PICTON_FERRY', name: 'Picton Ferry Terminal', lat: -41.2906, lng: 174.0089, radius: 50000, phase: 2 },
  { key: 'NZ_FIORDLAND_REMOTE', name: 'Fiordland Remote', lat: -45.4150, lng: 167.7183, radius: 200000, phase: 2 },
];

// ============================================
// Overpass 查询模板
// ============================================

/**
 * 构建 Overpass 查询 - 交通节点
 */
function buildTransportQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:180];
(
  nwr["aeroway"="aerodrome"](around:${radius}, ${lat}, ${lng});
  nwr["aeroway"="terminal"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="ferry_terminal"](around:${radius}, ${lat}, ${lng});
  nwr["man_made"="pier"](around:${radius}, ${lat}, ${lng});
  nwr["public_transport"="station"](around:${radius}, ${lat}, ${lng});
  nwr["highway"="bus_stop"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="parking"](around:${radius}, ${lat}, ${lng});
);
out center tags;`;
}

/**
 * 构建 Overpass 查询 - 安全保障点 + 补给
 */
function buildSafetySupplyQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:180];
(
  nwr["amenity"="hospital"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="clinic"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="pharmacy"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="police"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="fuel"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="charging_station"](around:${radius}, ${lat}, ${lng});
  nwr["shop"="supermarket"](around:${radius}, ${lat}, ${lng});
  nwr["shop"="convenience"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="toilets"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="shelter"](around:${radius}, ${lat}, ${lng});
);
out center tags;`;
}

/**
 * 构建 Overpass 查询 - 玩法入口点
 */
function buildActivityQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:180];
(
  nwr["highway"="trailhead"](around:${radius}, ${lat}, ${lng});
  nwr["tourism"="information"](around:${radius}, ${lat}, ${lng});
  nwr["tourism"="viewpoint"](around:${radius}, ${lat}, ${lng});
  nwr["tourism"="camp_site"](around:${radius}, ${lat}, ${lng});
  nwr["tourism"="alpine_hut"](around:${radius}, ${lat}, ${lng});
  nwr["amenity"="boat_rental"](around:${radius}, ${lat}, ${lng});
  nwr["office"="tourism"](around:${radius}, ${lat}, ${lng});
);
out center tags;`;
}

/**
 * 构建 Overpass 查询 - 新西兰自然类
 */
function buildNatureQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:180];
(
  nwr["natural"="volcano"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="geyser"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="hot_spring"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="glacier"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="waterfall"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="beach"](around:${radius}, ${lat}, ${lng});
  nwr["natural"="peak"](around:${radius}, ${lat}, ${lng});
);
out center tags;`;
}

// ============================================
// Overpass API 调用
// ============================================

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

/**
 * 执行 Overpass 查询
 */
function queryOverpass(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = query;
    
    const options = {
      hostname: 'overpass-api.de',
      port: 443,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.elements) {
            resolve(result);
          } else {
            reject(new Error(`Overpass API 返回异常: ${JSON.stringify(result).substring(0, 200)}`));
          }
        } catch (error) {
          reject(new Error(`解析 Overpass 响应失败: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 等待指定时间（避免 Overpass API 限流）
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 数据抓取主逻辑
// ============================================

interface OSMPOI {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
  region_key?: string;
  region_name?: string;
  region_center?: { lat: number; lng: number };
}

/**
 * 抓取单个区域的 POI 数据
 */
async function fetchRegionPOI(region: RegionConfig): Promise<OSMPOI[]> {
  console.log(`\n📍 抓取区域: ${region.name} (${region.key})`);
  console.log(`   中心点: (${region.lat}, ${region.lng}), 半径: ${region.radius / 1000}km`);
  
  const allPOIs: OSMPOI[] = [];
  const queries = [
    { name: '交通节点', query: buildTransportQuery(region.lat, region.lng, region.radius) },
    { name: '安全保障+补给', query: buildSafetySupplyQuery(region.lat, region.lng, region.radius) },
    { name: '玩法入口点', query: buildActivityQuery(region.lat, region.lng, region.radius) },
    { name: '自然类', query: buildNatureQuery(region.lat, region.lng, region.radius) },
  ];

  for (const { name, query } of queries) {
    try {
      console.log(`   🔍 查询: ${name}...`);
      const result = await queryOverpass(query);
      
      if (result.elements && result.elements.length > 0) {
        const pois = result.elements.map((el: any) => {
          const poi: OSMPOI = {
            type: el.type,
            id: el.id,
            tags: el.tags || {},
            region_key: region.key,
            region_name: region.name,
            region_center: { lat: region.lat, lng: region.lng },
          };

          // 处理坐标
          if (el.type === 'node' && el.lat && el.lon) {
            poi.lat = el.lat;
            poi.lon = el.lon;
          } else if (el.center) {
            poi.center = { lat: el.center.lat, lon: el.center.lon };
          }

          return poi;
        });

        allPOIs.push(...pois);
        console.log(`   ✅ 获取 ${pois.length} 个 POI`);
      } else {
        console.log(`   ⚠️  未找到数据`);
      }

      // 避免限流：每个查询之间等待 2 秒
      await sleep(2000);
    } catch (error) {
      console.error(`   ❌ 查询失败: ${error instanceof Error ? error.message : String(error)}`);
      // 继续执行下一个查询
    }
  }

  // 去重（基于 type + id）
  const uniquePOIs = new Map<string, OSMPOI>();
  for (const poi of allPOIs) {
    const key = `${poi.type}:${poi.id}`;
    if (!uniquePOIs.has(key)) {
      uniquePOIs.set(key, poi);
    }
  }

  const finalPOIs = Array.from(uniquePOIs.values());
  console.log(`   📊 总计: ${finalPOIs.length} 个唯一 POI\n`);

  return finalPOIs;
}

/**
 * 保存 POI 数据到文件
 */
function savePOIData(region: RegionConfig, pois: OSMPOI[]): void {
  const outputDir = path.join(process.cwd(), 'data/geographic/poi/osm/newzealand/raw');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存单个区域文件
  const regionFile = path.join(outputDir, `${region.key}.json`);
  fs.writeFileSync(regionFile, JSON.stringify(pois, null, 2), 'utf-8');
  console.log(`   💾 已保存: ${regionFile}`);
}

/**
 * 合并所有区域数据
 */
function mergeAllRegions(regions: RegionConfig[]): void {
  const outputDir = path.join(process.cwd(), 'data/geographic/poi/osm/newzealand/raw');
  const allPOIs: OSMPOI[] = [];

  for (const region of regions) {
    const regionFile = path.join(outputDir, `${region.key}.json`);
    if (fs.existsSync(regionFile)) {
      const pois: OSMPOI[] = JSON.parse(fs.readFileSync(regionFile, 'utf-8'));
      allPOIs.push(...pois);
    }
  }

  // 去重
  const uniquePOIs = new Map<string, OSMPOI>();
  for (const poi of allPOIs) {
    const key = `${poi.type}:${poi.id}`;
    if (!uniquePOIs.has(key)) {
      uniquePOIs.set(key, poi);
    }
  }

  const finalPOIs = Array.from(uniquePOIs.values());
  const allRegionsFile = path.join(outputDir, 'all_regions.json');
  fs.writeFileSync(allRegionsFile, JSON.stringify(finalPOIs, null, 2), 'utf-8');
  
  console.log(`\n✅ 合并完成: ${finalPOIs.length} 个唯一 POI`);
  console.log(`   💾 已保存: ${allRegionsFile}\n`);
}

// ============================================
// 主函数
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  let mode: 'phase1' | 'phase2' | 'all' | 'region' = 'phase1';
  let regionKey: string | null = null;

  // 解析命令行参数
  for (const arg of args) {
    if (arg === '--phase1') {
      mode = 'phase1';
    } else if (arg === '--phase2') {
      mode = 'phase2';
    } else if (arg === '--all') {
      mode = 'all';
    } else if (arg.startsWith('--region=')) {
      mode = 'region';
      regionKey = arg.split('=')[1];
    }
  }

  console.log('🗺️  新西兰 OSM POI 数据抓取\n');
  console.log('配置:');
  console.log(`  模式: ${mode}`);
  if (regionKey) {
    console.log(`  区域: ${regionKey}`);
  }
  console.log('');

  // 确定要抓取的区域
  let regionsToFetch: RegionConfig[] = [];
  
  if (mode === 'phase1') {
    regionsToFetch = NZ_REGIONS.filter(r => r.phase === 1);
  } else if (mode === 'phase2') {
    regionsToFetch = NZ_REGIONS.filter(r => r.phase === 2);
  } else if (mode === 'all') {
    regionsToFetch = NZ_REGIONS;
  } else if (mode === 'region' && regionKey) {
    const region = NZ_REGIONS.find(r => r.key === regionKey);
    if (!region) {
      console.error(`❌ 未找到区域: ${regionKey}`);
      console.log('\n可用区域:');
      NZ_REGIONS.forEach(r => console.log(`  - ${r.key}: ${r.name}`));
      process.exit(1);
    }
    regionsToFetch = [region];
  }

  console.log(`📋 将抓取 ${regionsToFetch.length} 个区域\n`);

  // 串行抓取（避免 Overpass API 限流）
  for (const region of regionsToFetch) {
    try {
      const pois = await fetchRegionPOI(region);
      savePOIData(region, pois);
      
      // 区域之间等待 5 秒
      if (regionsToFetch.indexOf(region) < regionsToFetch.length - 1) {
        console.log('⏳ 等待 5 秒后继续下一个区域...\n');
        await sleep(5000);
      }
    } catch (error) {
      console.error(`❌ 抓取区域 ${region.key} 失败:`, error);
      // 继续下一个区域
    }
  }

  // 合并所有区域数据
  if (regionsToFetch.length > 1) {
    mergeAllRegions(regionsToFetch);
  }

  console.log('✅ 抓取完成！');
  console.log('\n下一步:');
  console.log('  1. 导入到数据库: ts-node scripts/import-osm-poi-to-postgis.ts --input data/geographic/poi/osm/newzealand/raw/all_regions.json');
  console.log('  2. 规范化处理: ts-node scripts/normalize-osm-poi.ts');
}

// 运行主函数
main().catch((error) => {
  console.error('❌ 抓取失败:', error);
  process.exit(1);
});

