import { Module } from '@nestjs/common';
import { BookingComController } from './booking-com.controller';
import { BookingComService } from './booking-com.service';
import { BookingComIntegrationService } from './booking-com-integration.service';
import { BookingComMonitoringService } from './booking-com-monitoring.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [BookingComController],
  providers: [BookingComService, BookingComIntegrationService, BookingComMonitoringService],
  exports: [BookingComService, BookingComIntegrationService, BookingComMonitoringService],
})
export class BookingComModule {}
