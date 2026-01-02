#!/usr/bin/env ts-node
/**
 * 导入瑞士 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取瑞士 POI 数据
 * 
 * 使用方法:
 *   npm run import:switzerland-poi [--region <region_key>] [--profile <A|B|C|D>] [--all]
 */

import { PrismaClient } from '@prisma/client';
import { importPOI, BASE_OVERPASS_PROFILES, type RegionSeed } from './import-poi-generic';

const prisma = new PrismaClient();

/**
 * 瑞士主要区域配置
 */
const SWITZERLAND_REGIONS: RegionSeed[] = [
  {
    region_key: 'CH_ZURICH',
    name: '苏黎世',
    name_en: 'Zurich',
    description: '苏黎世：城市、交通、住宿、餐饮',
    seed: { lat: 47.3769, lng: 8.5417 },
    radius_km: 20,
    scenario: '城市出行',
    priority: 1,
  },
  {
    region_key: 'CH_LUCERNE',
    name: '卢塞恩',
    name_en: 'Lucerne',
    description: '卢塞恩湖区：景点、住宿、餐饮',
    seed: { lat: 47.0502, lng: 8.3093 },
    radius_km: 15,
    scenario: '湖区游览',
    priority: 1,
  },
  {
    region_key: 'CH_INTERLAKEN',
    name: '因特拉肯',
    name_en: 'Interlaken',
    description: '因特拉肯：少女峰门户、活动、住宿',
    seed: { lat: 46.6863, lng: 7.8632 },
    radius_km: 20,
    scenario: '山区活动',
    priority: 1,
  },
  {
    region_key: 'CH_JUNGFRAU',
    name: '少女峰',
    name_en: 'Jungfrau',
    description: '少女峰区域：观景、徒步、交通',
    seed: { lat: 46.5369, lng: 7.9625 },
    radius_km: 30,
    scenario: '山区观景',
    priority: 1,
  },
  {
    region_key: 'CH_ZERMATT',
    name: '采尔马特',
    name_en: 'Zermatt',
    description: '采尔马特：马特洪峰、徒步、住宿',
    seed: { lat: 46.0207, lng: 7.7491 },
    radius_km: 15,
    scenario: '山区活动',
    priority: 1,
  },
  {
    region_key: 'CH_MATTERHORN',
    name: '马特洪峰',
    name_en: 'Matterhorn',
    description: '马特洪峰区域：观景、徒步',
    seed: { lat: 45.9763, lng: 7.6586 },
    radius_km: 25,
    scenario: '山区观景',
    priority: 1,
  },
  {
    region_key: 'CH_ST_MORITZ',
    name: '圣莫里茨',
    name_en: 'St. Moritz',
    description: '圣莫里茨：冰川快车、湖区、住宿',
    seed: { lat: 46.4904, lng: 9.8355 },
    radius_km: 20,
    scenario: '湖区游览',
    priority: 1,
  },
  {
    region_key: 'CH_GENEVA',
    name: '日内瓦',
    name_en: 'Geneva',
    description: '日内瓦：城市、湖区、交通',
    seed: { lat: 46.2044, lng: 6.1432 },
    radius_km: 20,
    scenario: '城市出行',
    priority: 2,
  },
  {
    region_key: 'CH_BERN',
    name: '伯尔尼',
    name_en: 'Bern',
    description: '伯尔尼：首都、文化、交通',
    seed: { lat: 46.9481, lng: 7.4474 },
    radius_km: 15,
    scenario: '城市出行',
    priority: 2,
  },
];

async function main() {
  try {
    await importPOI('CH', SWITZERLAND_REGIONS, BASE_OVERPASS_PROFILES);
    
    console.log('\n✅ 瑞士 POI 导入完成');
    console.log('\n下一步：运行 link-poi-to-cities.ts 为 POI 关联 cityId');
    console.log('  npx tsx scripts/link-poi-to-cities.ts CH');
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

