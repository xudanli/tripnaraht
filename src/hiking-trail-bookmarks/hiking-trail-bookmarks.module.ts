import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HikingDemoModule } from '../hiking-demo/hiking-demo.module';
import { HikingTrailBookmarksController } from './hiking-trail-bookmarks.controller';
import { HikingTrailBookmarksService } from './hiking-trail-bookmarks.service';

@Module({
  imports: [PrismaModule, HikingDemoModule],
  controllers: [HikingTrailBookmarksController],
  providers: [HikingTrailBookmarksService],
  exports: [HikingTrailBookmarksService],
})
export class HikingTrailBookmarksModule {}
