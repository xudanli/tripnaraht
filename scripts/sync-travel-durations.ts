/**
 * 将 GET travel-info 计算结果写回 ItineraryItem.travelFromPrevious*
 * Usage: npx tsx scripts/sync-travel-durations.ts <tripId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ItineraryItemsService } from '../src/itinerary-items/itinerary-items.service';

async function main() {
  const tripId = process.argv[2];
  if (!tripId) {
    console.error('Usage: npx tsx scripts/sync-travel-durations.ts <tripId>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(ItineraryItemsService);
    const result = await svc.syncTravelDurationsFromDayTravelInfo(tripId);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
