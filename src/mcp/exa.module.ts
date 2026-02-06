import { Module } from '@nestjs/common';
import { ExaController } from './exa.controller';
import { ExaService } from './exa.service';
import { ExaIntegrationService } from './exa-integration.service';
import { ExaMonitoringService } from './exa-monitoring.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [ExaController],
  providers: [ExaService, ExaIntegrationService, ExaMonitoringService],
  exports: [ExaService, ExaIntegrationService, ExaMonitoringService],
})
export class ExaModule {}
