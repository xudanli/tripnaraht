import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RestaurantDirectController } from './restaurant-direct.controller';
import { RestaurantDirectService } from './restaurant-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [RestaurantDirectController],
  providers: [RestaurantDirectService],
  exports: [RestaurantDirectService],
})
export class RestaurantDirectModule {}
