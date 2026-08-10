import { Module } from '@nestjs/common';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { SelfDriveController } from './controllers/self-drive.controller';
import { SelfDriveKernelService } from './services/self-drive-kernel.service';

@Module({
  imports: [TripConstraintSolverModule],
  controllers: [SelfDriveController],
  providers: [SelfDriveKernelService],
  exports: [SelfDriveKernelService],
})
export class SelfDriveKernelModule {}
