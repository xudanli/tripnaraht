import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MyPackingListController } from './my-packing-list.controller';
import { PackingTemplatesController } from './packing-templates.controller';
import { TeamTasksAccessService } from './services/team-tasks-access.service';
import { TeamTasksMembersService } from './services/team-tasks-members.service';
import { TeamTasksService } from './services/team-tasks.service';
import { TeamTasksController } from './team-tasks.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    TeamTasksController,
    PackingTemplatesController,
    MyPackingListController,
  ],
  providers: [
    TeamTasksService,
    TeamTasksAccessService,
    TeamTasksMembersService,
  ],
  exports: [TeamTasksService],
})
export class TeamTasksModule {}
