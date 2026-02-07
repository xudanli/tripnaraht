import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationDirectController } from './translation-direct.controller';
import { TranslationDirectService } from './translation-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [TranslationDirectController],
  providers: [TranslationDirectService],
  exports: [TranslationDirectService],
})
export class TranslationDirectModule {}
