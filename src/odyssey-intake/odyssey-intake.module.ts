import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ProvidersModule } from '../providers/providers.module';
import { OdysseyIntakeController } from './odyssey-intake.controller';
import { OdysseyIntakeService } from './odyssey-intake.service';
import { CredentialVerificationGateway } from './gateway/credential-verification.gateway';

@Module({
  imports: [PrismaModule, RedisModule, ProvidersModule],
  controllers: [OdysseyIntakeController],
  providers: [OdysseyIntakeService, CredentialVerificationGateway],
  exports: [OdysseyIntakeService],
})
export class OdysseyIntakeModule {}
