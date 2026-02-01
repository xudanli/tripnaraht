#!/usr/bin/env tsx
/**
 * Physical Reality 与 DEM 数据关联测试脚本
 * 
 * 测试道路状态数据与DEM地形数据的关联功能
 */

import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { PhysicalRealityRetrievalService } from '../src/trips/readiness/services/physical-reality-retrieval.service';
import { PhysicalRealityDEMAssociationService } from '../src/trips/readiness/services/physical-reality-dem-association.service';
import { DEMElevationService } from '../src/trips/dem/services/dem-elevation.service';
import { ChunkRetrievalService } from '../src/rag/services/chunk-retrieval.service';
import { EmbeddingService } from '../src/places/services/embedding.service';

async function testPhysicalRealityDEMAssociation() {
  console.log('🧪 测试 Physical Reality 与 DEM 数据关联...\n');

  const prisma = new PrismaClient();
  const prismaService = new PrismaService();
  
  // EmbeddingService需要ConfigService，在测试脚本中跳过检索功能
  // 只测试DEM关联功能（需要DEMElevationService）
  console.log('⚠️  注意: EmbeddingService需要ConfigService，跳过检索测试');
  console.log('✅ 将测试DEM关联功能（需要DEMElevationService）\n');
  
  const demService = new DEMElevationService(prismaService);
  
  // 创建模拟的PhysicalRealityRetrievalService（不使用）
  const physicalRealityService = undefined;
  const demAssociationService = new PhysicalRealityDEMAssociationService(
    physicalRealityService,
    demService
  );

  try {
    // 测试1: 直接增强已有道路状态数据（不依赖检索）
    console.log('📋 测试1: 直接增强道路状态数据（DEM关联）');
    console.log('─────────────────────────────────────────');

    // 创建示例道路状态（有坐标）
    const sampleRoad: any = {
      roadId: 'test-road-001',
      roadName: '测试道路',
      status: 'OPEN',
      coordinates: {
        start: { lat: 64.15, lng: -21.95, name: '起点' },
        end: { lat: 64.20, lng: -21.90, name: '终点' },
      },
    };

    const enhancedRoad = await demAssociationService.enhanceRoadStateWithDEM(sampleRoad);

    console.log(`✅ 增强了道路状态数据\n`);

    const enhancedRoads = [enhancedRoad];
    enhancedRoads.forEach((road, idx) => {
      console.log(`${idx + 1}. ${road.roadName} (${road.roadId})`);
      console.log(`   状态: ${road.status}`);
      
      if (road.terrainFeatures) {
        const tf = road.terrainFeatures;
        console.log(`   地形特征:`);
        console.log(`     - DEM可用: ${tf.demAvailable ? '是' : '否'}`);
        
        if (tf.demAvailable) {
          if (tf.startElevation !== undefined) {
            console.log(`     - 起点海拔: ${tf.startElevation.toFixed(0)}m`);
          }
          if (tf.endElevation !== undefined) {
            console.log(`     - 终点海拔: ${tf.endElevation.toFixed(0)}m`);
          }
          if (tf.avgElevation !== undefined) {
            console.log(`     - 平均海拔: ${tf.avgElevation.toFixed(0)}m`);
          }
          if (tf.maxElevation !== undefined && tf.minElevation !== undefined) {
            console.log(`     - 海拔范围: ${tf.minElevation.toFixed(0)}m - ${tf.maxElevation.toFixed(0)}m`);
          }
          if (tf.totalAscent !== undefined) {
            console.log(`     - 总爬升: ${tf.totalAscent.toFixed(0)}m`);
          }
          if (tf.totalDescent !== undefined) {
            console.log(`     - 总下降: ${tf.totalDescent.toFixed(0)}m`);
          }
          if (tf.avgSlope !== undefined) {
            console.log(`     - 平均坡度: ${tf.avgSlope.toFixed(1)}%`);
          }
          if (tf.terrainComplexity !== undefined) {
            console.log(`     - 地形复杂度: ${(tf.terrainComplexity * 100).toFixed(0)}%`);
          }
        }
      } else {
        console.log(`   地形特征: 无（DEM服务不可用或缺少坐标）`);
      }
      console.log('');
    });

    // 测试2: 验证DEM关联功能
    console.log('\n📋 测试2: 验证DEM关联功能');
    console.log('─────────────────────────────────────────');

    console.log(`✅ 增强道路: ${enhancedRoad.roadName}`);
    if (enhancedRoad.terrainFeatures?.demAvailable) {
      console.log(`   DEM数据可用`);
      if (enhancedRoad.terrainFeatures.startElevation !== undefined) {
        console.log(`   起点海拔: ${enhancedRoad.terrainFeatures.startElevation.toFixed(0)}m`);
      }
      if (enhancedRoad.terrainFeatures.endElevation !== undefined) {
        console.log(`   终点海拔: ${enhancedRoad.terrainFeatures.endElevation.toFixed(0)}m`);
      }
      if (enhancedRoad.terrainFeatures.avgElevation !== undefined) {
        console.log(`   平均海拔: ${enhancedRoad.terrainFeatures.avgElevation.toFixed(0)}m`);
      }
      if (enhancedRoad.terrainFeatures.terrainComplexity !== undefined) {
        console.log(`   地形复杂度: ${(enhancedRoad.terrainFeatures.terrainComplexity * 100).toFixed(0)}%`);
      }
    } else {
      console.log(`   DEM数据不可用（可能是DEM服务不可用或该区域无DEM数据）`);
      console.log(`   💡 提示: DEM关联功能需要在有DEM数据的区域测试`);
    }

    console.log('\n\n✅ 测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testPhysicalRealityDEMAssociation().catch(console.error);
