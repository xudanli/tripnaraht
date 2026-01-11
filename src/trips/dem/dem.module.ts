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

@Module({
  imports: [
    PrismaModule, // DEM 服务需要访问数据库
  ],
  providers: [
    DEMElevationService,
    DEMEffortMetadataService,
  ],
  exports: [
    DEMElevationService,
    DEMEffortMetadataService,
  ],
})
export class DemModule {}
