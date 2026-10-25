import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PolicyLabConflictMatrixService } from './policy-lab-conflict-matrix.service';

@Module({
  imports: [PrismaModule],
  providers: [PolicyLabConflictMatrixService],
  exports: [PolicyLabConflictMatrixService],
})
export class PolicyLabModule {}
