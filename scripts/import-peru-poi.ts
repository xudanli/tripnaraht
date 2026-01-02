#!/usr/bin/env ts-node
/**
 * 导入秘鲁 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取秘鲁 POI 数据
 * 
 * 使用方法:
 *   npm run import:peru-poi [--region <region_key>] [--profile <A|B|C|D>] [--all]
 */

import { PrismaClient } from '@prisma/client';
import { importPOI, BASE_OVERPASS_PROFILES, type RegionSeed } from './import-poi-generic';

const prisma = new PrismaClient();

/**
 * 秘鲁主要区域配置
 */
const PERU_REGIONS: RegionSeed[] = [
  {
    region_key: 'PE_CUSCO',
    name: '库斯科',
    name_en: 'Cusco',
    description: '库斯科：印加文化、住宿、餐饮、适应',
    seed: { lat: -13.5319, lng: -71.9675 },
    radius_km: 20,
    scenario: '文化城市',
    priority: 1,
  },
  {
    region_key: 'PE_MACHU_PICCHU',
    name: '马丘比丘',
    name_en: 'Machu Picchu',
    description: '马丘比丘：世界遗产、观景、徒步',
    seed: { lat: -13.1631, lng: -72.5450 },
    radius_km: 15,
    scenario: '世界遗产',
    priority: 1,
  },
  {
    region_key: 'PE_SACRED_VALLEY',
    name: '圣谷',
    name_en: 'Sacred Valley',
    description: '圣谷：印加遗址、适应、文化',
    seed: { lat: -13.3333, lng: -72.0833 },
    radius_km: 40,
    scenario: '文化适应',
    priority: 1,
  },
  {
    region_key: 'PE_URUBAMBA',
    name: '乌鲁班巴',
    name_en: 'Urubamba',
    description: '乌鲁班巴：圣谷中心、住宿、适应',
    seed: { lat: -13.3053, lng: -72.1164 },
    radius_km: 15,
    scenario: '适应基地',
    priority: 1,
  },
  {
    region_key: 'PE_AGUAS_CALIENTES',
    name: '热水镇',
    name_en: 'Aguas Calientes',
    description: '热水镇：马丘比丘门户、住宿、餐饮',
    seed: { lat: -13.1547, lng: -72.5256 },
    radius_km: 10,
    scenario: '门户小镇',
    priority: 1,
  },
  {
    region_key: 'PE_INCA_TRAIL',
    name: '印加古道',
    name_en: 'Inca Trail',
    description: '印加古道：徒步路线、营地、观景',
    seed: { lat: -13.2000, lng: -72.4000 },
    radius_km: 50,
    scenario: '徒步路线',
    priority: 1,
  },
  {
    region_key: 'PE_AUSANGATE',
    name: '奥桑加特',
    name_en: 'Ausangate',
    description: '奥桑加特环线：高海拔徒步、营地',
    seed: { lat: -13.7833, lng: -71.2167 },
    radius_km: 60,
    scenario: '高海拔徒步',
    priority: 2,
  },
  {
    region_key: 'PE_LIMA',
    name: '利马',
    name_en: 'Lima',
    description: '利马：首都、交通、住宿、餐饮',
    seed: { lat: -12.0464, lng: -77.0428 },
    radius_km: 30,
    scenario: '城市出行',
    priority: 2,
  },
];

async function main() {
  try {
    await importPOI('PE', PERU_REGIONS, BASE_OVERPASS_PROFILES);
    
    console.log('\n✅ 秘鲁 POI 导入完成');
    console.log('\n下一步：运行 link-poi-to-cities.ts 为 POI 关联 cityId');
    console.log('  npx tsx scripts/link-poi-to-cities.ts PE');
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

