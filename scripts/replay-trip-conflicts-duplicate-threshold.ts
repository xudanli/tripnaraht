/**
 * Replay: TripConflictsService cross-day duplicate threshold
 *
 * 目标：对齐排产策略（跨日重访 2 次允许，>2 才提示）
 *
 * 用法：
 * - npx tsx scripts/replay-trip-conflicts-duplicate-threshold.ts
 */
import { TripConflictsService } from '../src/trips/services/trip-conflicts.service';

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`[replay-trip-conflicts-duplicate-threshold] ${msg}`);
}

async function main() {
  // stub prisma: 只实现 getTripConflicts 需要的 findUnique
  const makeTrip = (dupCount: number) => {
    const mkItem = (i: number) => ({
      id: `it_${i}`,
      placeId: 42,
      Place: { nameCN: '辛格维利尔国家公园', nameEN: 'Thingvellir' },
    });
    return {
      id: 'trip_x',
      TripDay: Array.from({ length: dupCount }, (_, idx) => ({
        id: `day_${idx + 1}`,
        date: new Date(Date.UTC(2026, 3, 28 + idx)),
        ItineraryItem: [mkItem(idx + 1)],
      })),
    };
  };

  const prismaStub: any = {
    trip: {
      findUnique: async ({ where }: any) => {
        if (where?.id === 'trip_dup2') return makeTrip(2);
        if (where?.id === 'trip_dup3') return makeTrip(3);
        return null;
      },
    },
  };

  const svc = new TripConflictsService(prismaStub);

  const res2 = await svc.getConflicts('trip_dup2');
  const hasCrossDayDup2 = res2.conflicts.some((c: any) => c.id?.includes('duplicate-item-cross-day'));
  assert(!hasCrossDayDup2, 'dupCount=2 should NOT produce cross-day duplicate conflict');

  const res3 = await svc.getConflicts('trip_dup3');
  const hasCrossDayDup3 = res3.conflicts.some((c: any) => c.id?.includes('duplicate-item-cross-day'));
  assert(hasCrossDayDup3, 'dupCount=3 should produce cross-day duplicate conflict');

  console.log('[replay-trip-conflicts-duplicate-threshold] OK');
}

main().catch((e: any) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

