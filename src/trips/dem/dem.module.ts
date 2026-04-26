// src/trips/dem/dem.module.ts

/**
 * DEM Module
 * 
 * 数字高程模型（Digital Elevation Model）模块
 * 提供海拔查询和体力消耗计算服务
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DEMElevationService } from './services/dem-elevation.service';
import { DEMEffortMetadataService } from './services/dem-effort-metadata.service';
import { StateConsistencyGuardService } from './services/state-consistency-guard.service';
import { DemController } from './dem.controller';

@Module({
  imports: [
    PrismaModule, // DEM 服务需要访问数据库
  ],
  controllers: [DemController],
  providers: [
    DEMElevationService,
    DEMEffortMetadataService,
    StateConsistencyGuardService,
  ],
  exports: [
    DEMElevationService,
    DEMEffortMetadataService,
    StateConsistencyGuardService,
  ],
})
export class DemModule {}
