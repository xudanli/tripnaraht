import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { QueryRewritingModule } from '../agent/query-rewriting.module';
import { HotelDirectController } from './hotel-direct.controller';
import { HotelDirectService } from './hotel-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    QueryRewritingModule,
  ],
  controllers: [HotelDirectController],
  providers: [HotelDirectService],
  exports: [HotelDirectService],
})
export class HotelDirectModule {}
