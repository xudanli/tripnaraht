import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeDirectController } from './stripe-direct.controller';
import { StripeDirectService } from './stripe-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [StripeDirectController],
  providers: [StripeDirectService],
  exports: [StripeDirectService],
})
export class StripeDirectModule {}
