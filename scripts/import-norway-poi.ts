#!/usr/bin/env ts-node
/**
 * 导入挪威 POI 数据
 * 
 * 使用 Overpass API 从 OSM 抓取挪威 POI 数据
 * 
 * 使用方法:
 *   npm run import:norway-poi [--region <region_key>] [--profile <A|B|C|D>] [--all]
 */

import { PrismaClient } from '@prisma/client';
import { importPOI, BASE_OVERPASS_PROFILES, type RegionSeed } from './import-poi-generic';

const prisma = new PrismaClient();

/**
 * 挪威主要区域配置
 */
const NORWAY_REGIONS: RegionSeed[] = [
  {
    region_key: 'NO_OSLO',
    name: '奥斯陆',
    name_en: 'Oslo',
    description: '奥斯陆：首都、交通、住宿、餐饮',
    seed: { lat: 59.9139, lng: 10.7522 },
    radius_km: 25,
    scenario: '城市出行',
    priority: 1,
  },
  {
    region_key: 'NO_BERGEN',
    name: '卑尔根',
    name_en: 'Bergen',
    description: '卑尔根：峡湾门户、交通、住宿',
    seed: { lat: 60.3913, lng: 5.3221 },
    radius_km: 20,
    scenario: '峡湾游览',
    priority: 1,
  },
  {
    region_key: 'NO_SOGNEFJORD',
    name: '松恩峡湾',
    name_en: 'Sognefjord',
    description: '松恩峡湾：观景、游船、住宿',
    seed: { lat: 61.1000, lng: 6.8000 },
    radius_km: 50,
    scenario: '峡湾游览',
    priority: 1,
  },
  {
    region_key: 'NO_GEIRANGER',
    name: '盖朗厄尔峡湾',
    name_en: 'Geirangerfjord',
    description: '盖朗厄尔峡湾：观景、游船',
    seed: { lat: 62.1000, lng: 7.2000 },
    radius_km: 40,
    scenario: '峡湾游览',
    priority: 1,
  },
  {
    region_key: 'NO_PREIKESTOLEN',
    name: '布道台',
    name_en: 'Preikestolen',
    description: '布道台：徒步、观景',
    seed: { lat: 58.9869, lng: 6.1875 },
    radius_km: 30,
    scenario: '徒步观景',
    priority: 1,
  },
  {
    region_key: 'NO_KJERAG',
    name: '奇迹石',
    name_en: 'Kjerag',
    description: '奇迹石：徒步、观景',
    seed: { lat: 59.0333, lng: 6.5833 },
    radius_km: 30,
    scenario: '徒步观景',
    priority: 1,
  },
  {
    region_key: 'NO_TROMSOE',
    name: '特罗姆瑟',
    name_en: 'Tromso',
    description: '特罗姆瑟：极光、活动、住宿',
    seed: { lat: 69.6492, lng: 18.9553 },
    radius_km: 20,
    scenario: '极光观测',
    priority: 1,
  },
  {
    region_key: 'NO_LOFOTEN',
    name: '罗弗敦',
    name_en: 'Lofoten',
    description: '罗弗敦群岛：摄影、徒步、住宿',
    seed: { lat: 68.2200, lng: 13.8000 },
    radius_km: 60,
    scenario: '摄影徒步',
    priority: 1,
  },
  {
    region_key: 'NO_ATLANTIC_ROAD',
    name: '大西洋公路',
    name_en: 'Atlantic Road',
    description: '大西洋公路：风景公路、观景',
    seed: { lat: 63.0167, lng: 7.3500 },
    radius_km: 30,
    scenario: '风景公路',
    priority: 2,
  },
];

async function main() {
  try {
    await importPOI('NO', NORWAY_REGIONS, BASE_OVERPASS_PROFILES);
    
    console.log('\n✅ 挪威 POI 导入完成');
    console.log('\n下一步：运行 link-poi-to-cities.ts 为 POI 关联 cityId');
    console.log('  npx tsx scripts/link-poi-to-cities.ts NO');
  } catch (error: any) {
    console.error('❌ 导入失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

