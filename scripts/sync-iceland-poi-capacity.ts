/**
 * 手动同步冰岛 POI 预约库存（Parka / Bókun 种子）
 *
 * 用法: npm run sync:iceland-poi-capacity
 */

import { PrismaClient } from '@prisma/client';
import { ParkaCapacityProvider } from '../src/poi-access-capacity/providers/parka-capacity.provider';
import { BokunCapacityProvider } from '../src/poi-access-capacity/providers/bokun-capacity.provider';
import { IcelandCapacitySyncService } from '../src/poi-access-capacity/services/iceland-capacity-sync.service';

const prisma = new PrismaClient();
const parka = new ParkaCapacityProvider();
const bokun = new BokunCapacityProvider();
const sync = new IcelandCapacitySyncService(prisma as any, parka, bokun);

async function main() {
  const result = await sync.syncFromSeedFile();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
