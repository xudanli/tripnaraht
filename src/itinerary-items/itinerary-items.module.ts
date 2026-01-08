import { Module } from '@nestjs/common';
import { ItineraryItemsService } from './itinerary-items.service';
import { ItineraryItemsController } from './itinerary-items.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportModule } from '../transport/transport.module';

@Module({
  imports: [PrismaModule, TransportModule], // 导入 PrismaModule 和 TransportModule
  controllers: [ItineraryItemsController],
  providers: [ItineraryItemsService],
  exports: [ItineraryItemsService], // 导出 Service，供其他模块使用
})
export class ItineraryItemsModule {}
