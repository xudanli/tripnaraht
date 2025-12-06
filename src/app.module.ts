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
  ],
})
export class AppModule {}

