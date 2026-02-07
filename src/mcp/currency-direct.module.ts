import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CurrencyDirectController } from './currency-direct.controller';
import { CurrencyDirectService } from './currency-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [CurrencyDirectController],
  providers: [CurrencyDirectService],
  exports: [CurrencyDirectService],
})
export class CurrencyDirectModule {}
