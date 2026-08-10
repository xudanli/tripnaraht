import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TeamLedgerController } from './team-ledger.controller';
import { TeamLedgerAccessService } from './services/team-ledger-access.service';
import { TeamLedgerMembersService } from './services/team-ledger-members.service';
import { TeamLedgerService } from './services/team-ledger.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeamLedgerController],
  providers: [
    TeamLedgerService,
    TeamLedgerAccessService,
    TeamLedgerMembersService,
  ],
  exports: [TeamLedgerService],
})
export class TeamLedgerModule {}
