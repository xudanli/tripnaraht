import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XiaohongshuDirectService } from './xiaohongshu-direct.service';

@Module({
  imports: [ConfigModule],
  providers: [XiaohongshuDirectService],
  exports: [XiaohongshuDirectService],
})
export class XiaohongshuDirectModule {}
