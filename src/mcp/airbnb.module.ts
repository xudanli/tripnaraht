import { Module } from '@nestjs/common';
import { AirbnbController } from './airbnb.controller';
import { AirbnbService } from './airbnb.service';
import { AirbnbIntegrationService } from './airbnb-integration.service';
import { AirbnbMonitoringService } from './airbnb-monitoring.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [AirbnbController],
  providers: [AirbnbService, AirbnbIntegrationService, AirbnbMonitoringService],
  exports: [AirbnbService, AirbnbIntegrationService, AirbnbMonitoringService],
})
export class AirbnbModule {}
