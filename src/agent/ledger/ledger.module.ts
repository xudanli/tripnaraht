import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GovernanceLedgerPrismaPersistenceService } from './governance-ledger-prisma.persistence.service';
import { GovernanceLedgerStoreService } from './governance-ledger.store.service';

@Module({
  imports: [PrismaModule],
  providers: [GovernanceLedgerPrismaPersistenceService, GovernanceLedgerStoreService],
  exports: [GovernanceLedgerPrismaPersistenceService, GovernanceLedgerStoreService],
})
export class LedgerModule {}
