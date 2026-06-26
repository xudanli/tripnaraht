import { Module, forwardRef } from '@nestjs/common';
import { ItineraryItemsService } from './itinerary-items.service';
import { ItineraryItemsController } from './itinerary-items.controller';
import { ItineraryValidationService } from './services/itinerary-validation.service';
import { TravelTimeCacheService } from './services/travel-time-cache.service';
import { ItemCostService } from './services/item-cost.service';
import { TravelTimeValidator } from './validators/travel-time.validator';
import { BufferTimeValidator } from './validators/buffer-time.validator';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportModule } from '../transport/transport.module';
import { PlacesModule } from '../places/places.module';
import { GoogleMapsDirectModule } from '../mcp/google-maps-direct.module';
import { TripBudgetOsModule } from '../trips/budget-os/budget-os.module';

@Module({
  imports: [
    PrismaModule, 
    TransportModule,
    forwardRef(() => PlacesModule),
    forwardRef(() => TripBudgetOsModule),
    GoogleMapsDirectModule,
  ],
  controllers: [ItineraryItemsController],
  providers: [
    // 核心服务
    ItineraryItemsService,
    ItineraryValidationService,
    TravelTimeCacheService,
    ItemCostService,
    // 校验器
    TravelTimeValidator,
    BufferTimeValidator,
  ],
  exports: [ItineraryItemsService, ItineraryValidationService, ItemCostService],
})
export class ItineraryItemsModule {}
