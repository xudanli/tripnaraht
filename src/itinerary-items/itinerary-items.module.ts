import { Module } from '@nestjs/common';
import { ItineraryItemsService } from './itinerary-items.service';
import { ItineraryItemsController } from './itinerary-items.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule], // 导入 PrismaModule 以使用 PrismaService
  controllers: [ItineraryItemsController],
  providers: [ItineraryItemsService],
  exports: [ItineraryItemsService], // 导出 Service，供其他模块使用
})
export class ItineraryItemsModule {}
