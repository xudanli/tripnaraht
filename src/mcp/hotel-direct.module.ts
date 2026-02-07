import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelDirectController } from './hotel-direct.controller';
import { HotelDirectService } from './hotel-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [HotelDirectController],
  providers: [HotelDirectService],
  exports: [HotelDirectService],
})
export class HotelDirectModule {}
