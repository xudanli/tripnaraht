/**
 * 手动同步冰岛 POI 准入动态状态（Vatnajökull 步道、Dyrhólaey 等）
 *
 * 用法: npm run sync:iceland-poi-access-status
 */

import { PrismaClient } from '@prisma/client';
import { VatnajokullTrailStatusProvider } from '../src/poi-access-capacity/providers/vatnajokull-trail-status.provider';
import { DyrholaeyBreedingStatusProvider } from '../src/poi-access-capacity/providers/dyrholaey-breeding-status.provider';
import { IcelandPoiAccessSyncService } from '../src/poi-access-capacity/services/iceland-poi-access-sync.service';

const prisma = new PrismaClient();
const vatnajokull = new VatnajokullTrailStatusProvider();
const dyrholaey = new DyrholaeyBreedingStatusProvider();
const sync = new IcelandPoiAccessSyncService(prisma as any, vatnajokull, dyrholaey);

async function main() {
  const result = await sync.syncAll();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
