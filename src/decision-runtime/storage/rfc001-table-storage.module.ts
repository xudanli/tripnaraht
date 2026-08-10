/**
 * P2 — RFC-001 formal table storage (repos + reconcile + rollback).
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { Rfc001PlanVersionTableRepository } from './rfc001-plan-version.table';
import { Rfc001DecisionLedgerTableRepository } from './rfc001-decision-ledger.table';
import { Rfc001DecisionWorkspaceTableRepository } from './rfc001-decision-workspace.table';
import { Rfc001TableStorageReconcileService } from './rfc001-table-storage-reconcile.service';
import { Rfc001TableStorageRollbackService } from './rfc001-table-storage-rollback.service';

@Module({
  imports: [PrismaModule],
  providers: [
    Rfc001PlanVersionTableRepository,
    Rfc001DecisionLedgerTableRepository,
    Rfc001DecisionWorkspaceTableRepository,
    Rfc001TableStorageReconcileService,
    Rfc001TableStorageRollbackService,
  ],
  exports: [
    Rfc001PlanVersionTableRepository,
    Rfc001DecisionLedgerTableRepository,
    Rfc001DecisionWorkspaceTableRepository,
    Rfc001TableStorageReconcileService,
    Rfc001TableStorageRollbackService,
  ],
})
export class Rfc001TableStorageModule {}
