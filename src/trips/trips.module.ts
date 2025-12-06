import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule], // 导入 PrismaModule 以使用 PrismaService
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
