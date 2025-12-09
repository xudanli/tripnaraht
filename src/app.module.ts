// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PlacesModule } from './places/places.module';
import { TripsModule } from './trips/trips.module';
import { ItineraryItemsModule } from './itinerary-items/itinerary-items.module';
import { TasksModule } from './tasks/tasks.module';
import { CountriesModule } from './countries/countries.module';
import { TransportModule } from './transport/transport.module';
import { FlightPricesModule } from './flight-prices/flight-prices.module';
import { ItineraryOptimizationModule } from './itinerary-optimization/itinerary-optimization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    PlacesModule,
    TripsModule,
    ItineraryItemsModule,
    TasksModule, // 定时任务模块
    CountriesModule, // 国家档案模块
    TransportModule, // 交通规划模块
    FlightPricesModule, // 机票价格参考模块
    ItineraryOptimizationModule, // 路线优化模块（节奏感算法）
  ],
})
export class AppModule {}

