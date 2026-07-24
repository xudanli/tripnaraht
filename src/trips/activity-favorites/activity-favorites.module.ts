import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityFavoritesController } from './activity-favorites.controller';
import { ActivityFavoriteService } from './services/activity-favorite.service';
import { ActivityFavoriteAccessService } from './services/activity-favorite-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [ActivityFavoritesController],
  providers: [ActivityFavoriteService, ActivityFavoriteAccessService],
  exports: [ActivityFavoriteService],
})
export class ActivityFavoritesModule {}
