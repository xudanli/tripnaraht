// src/prisma/prisma.module.ts
import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';
import { AiNativePersistenceHealthService } from './ai-native-persistence-health.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, AiNativePersistenceHealthService],
  exports: [PrismaService],
})
export class PrismaModule {}

