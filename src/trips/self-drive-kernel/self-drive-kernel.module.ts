import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { IcelandSelfDriveModule } from '../iceland-self-drive/iceland-self-drive.module';
import { SelfDriveController } from './controllers/self-drive.controller';
import { SelfDriveSettingsAdminController } from './controllers/self-drive-settings-admin.controller';
import { SelfDriveKernelService } from './services/self-drive-kernel.service';
import { SelfDriveSettingsFacade } from './services/self-drive-settings.facade';

@Module({
  imports: [
    PrismaModule,
    TripConstraintSolverModule,
    forwardRef(() => IcelandSelfDriveModule),
  ],
  controllers: [SelfDriveController, SelfDriveSettingsAdminController],
  providers: [SelfDriveKernelService, SelfDriveSettingsFacade],
  exports: [SelfDriveKernelService, SelfDriveSettingsFacade],
})
export class SelfDriveKernelModule {}
