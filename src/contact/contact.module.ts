// src/contact/contact.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactController } from './contact.controller';
import { ContactService } from './services/contact.service';
import { FileStorageService } from './services/file-storage.service';
import { RateLimitService } from './services/rate-limit.service';
import { ContactNotificationService } from './services/contact-notification.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  controllers: [ContactController],
  providers: [
    ContactService,
    FileStorageService,
    RateLimitService,
    ContactNotificationService,
  ],
  exports: [ContactService],
})
export class ContactModule {}
