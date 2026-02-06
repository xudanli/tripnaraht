import { Module } from '@nestjs/common';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarIntegrationService } from './google-calendar-integration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService, GoogleCalendarIntegrationService],
  exports: [GoogleCalendarService, GoogleCalendarIntegrationService],
})
export class GoogleCalendarModule {}
