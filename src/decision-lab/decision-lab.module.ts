import { Module } from '@nestjs/common';
import { LabBenchmarkService } from './benchmark/lab-benchmark.service';
import { DecisionLabAdminController } from './controllers/decision-lab-admin.controller';

/**
 * Decision Lab — benchmarks, fixtures, solver comparison.
 * Isolated from production Effective Plan writes.
 * Enable with DECISION_LAB_ENABLED=1.
 */
@Module({
  controllers: [DecisionLabAdminController],
  providers: [LabBenchmarkService],
  exports: [LabBenchmarkService],
})
export class DecisionLabModule {}
