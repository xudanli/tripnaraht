// src/trips/readiness/storage/pack-storage.service.ts

/**
 * Pack Storage Service
 * 
 * 负责 Readiness Pack 的存储和加载
 * 使用数据库存储，支持从 JSON 文件导入
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ReadinessPack } from '../types/readiness-pack.types';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PackStorageService {
  private readonly logger = new Logger(PackStorageService.name);
  private readonly packsDirectory: string;

  constructor(private readonly prisma: PrismaService) {
    // Pack 文件存储目录（用于导入）：src/trips/readiness/data/packs/
    this.packsDirectory = join(__dirname, '../data/packs');
  }

  /**
   * 从数据库加载单个 Pack
   */
  async loadPack(packId: string): Promise<ReadinessPack | null> {
    try {
      const record = await this.prisma.readinessPack.findUnique({
        where: { packId, isActive: true },
      });

      if (!record) {
        this.logger.debug(`Pack not found in database: ${packId}`);
        return null;
      }

      // 从 packData JSON 字段恢复 Pack 对象
      const pack = record.packData as unknown as ReadinessPack;
      return pack;
    } catch (error: any) {
      this.logger.error(`Failed to load pack ${packId}: ${error.message}`);
      return null;
    }
  }

  /**
   * 从数据库加载所有激活的 Pack
   */
  async loadAllPacks(): Promise<ReadinessPack[]> {
    try {
      const records = await this.prisma.readinessPack.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      const packs = records
        .map((record): ReadinessPack => record.packData as unknown as ReadinessPack)
        .filter((pack): pack is ReadinessPack => pack !== null);

      this.logger.log(`Loaded ${packs.length} packs from database`);
      return packs;
    } catch (error: any) {
      this.logger.error(`Failed to load packs: ${error.message}`);
      return [];
    }
  }

  /**
   * 根据目的地 ID 查找 Pack
   */
  async findPackByDestination(destinationId: string): Promise<ReadinessPack | null> {
    try {
      const record = await this.prisma.readinessPack.findFirst({
        where: {
          destinationId,
          isActive: true,
        },
        orderBy: { version: 'desc' }, // 获取最新版本
      });

      if (!record) {
        return null;
      }

      return record.packData as unknown as ReadinessPack;
    } catch (error: any) {
      this.logger.error(`Failed to find pack by destination ${destinationId}: ${error.message}`);
      return null;
    }
  }

  /**
   * 根据国家代码查找 Pack
   */
  async findPacksByCountry(countryCode: string): Promise<ReadinessPack[]> {
    try {
      const records = await this.prisma.readinessPack.findMany({
        where: {
          countryCode: countryCode.toUpperCase(),
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      return records.map(record => record.packData as unknown as ReadinessPack);
    } catch (error: any) {
      this.logger.error(`Failed to find packs by country ${countryCode}: ${error.message}`);
      return [];
    }
  }

  /**
   * 根据城市名称查找 Pack
   * @param cityName 城市名称（不区分大小写）
   * @param countryCode 可选的国家代码，用于精确匹配
   */
  async findPackByCity(cityName: string, countryCode?: string): Promise<ReadinessPack | null> {
    try {
      // 使用 PostgreSQL 的 ILIKE 进行不区分大小写的查询
      let whereClause = Prisma.sql`WHERE "isActive" = true AND LOWER("city") = LOWER(${cityName})`;
      
      if (countryCode) {
        whereClause = Prisma.sql`${whereClause} AND "countryCode" = ${countryCode.toUpperCase()}`;
      }

      const records = await this.prisma.$queryRaw<any[]>`
        SELECT *
        FROM "ReadinessPack"
        ${whereClause}
        ORDER BY version DESC
        LIMIT 1
      `;

      if (records.length === 0) {
        return null;
      }

      return records[0].packData as unknown as ReadinessPack;
    } catch (error: any) {
      this.logger.error(`Failed to find pack by city ${cityName}: ${error.message}`);
      return null;
    }
  }

  /**
   * 根据 region 查找 Pack
   * @param regionName 地区名称（不区分大小写）
   */
  async findPacksByRegion(regionName: string): Promise<ReadinessPack[]> {
    try {
      // 使用 PostgreSQL 的 ILIKE 进行不区分大小写的查询
      const records = await this.prisma.$queryRaw<any[]>`
        SELECT *
        FROM "ReadinessPack"
        WHERE "isActive" = true 
          AND LOWER("region") = LOWER(${regionName})
        ORDER BY "updatedAt" DESC
      `;

      return records.map(record => record.packData as unknown as ReadinessPack);
    } catch (error: any) {
      this.logger.error(`Failed to find packs by region ${regionName}: ${error.message}`);
      return [];
    }
  }

  /**
   * 根据坐标查找最近的 Pack
   * @param lat 纬度
   * @param lng 经度
   * @param maxDistanceKm 最大距离（公里），默认 50km
   */
  async findNearestPack(lat: number, lng: number, maxDistanceKm: number = 50): Promise<ReadinessPack | null> {
    try {
      // 使用 Haversine 公式计算距离
      // 由于 Prisma 可能不支持 PostGIS 的 ST_Distance，我们使用原始 SQL 查询
      const records = await this.prisma.$queryRaw<any[]>`
        SELECT 
          *,
          (
            6371 * acos(
              cos(radians(${lat})) * 
              cos(radians("latitude")) * 
              cos(radians("longitude") - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians("latitude"))
            )
          ) AS distance_km
        FROM "ReadinessPack"
        WHERE 
          "isActive" = true
          AND "latitude" IS NOT NULL
          AND "longitude" IS NOT NULL
        ORDER BY distance_km ASC
        LIMIT 1
      `;

      if (records.length === 0) {
        return null;
      }

      const record = records[0];
      const distanceKm = parseFloat(record.distance_km);

      // 如果距离超过阈值，返回 null
      if (distanceKm > maxDistanceKm) {
        this.logger.debug(`Nearest pack is ${distanceKm.toFixed(2)}km away, exceeds threshold ${maxDistanceKm}km`);
        return null;
      }

      this.logger.debug(`Found nearest pack ${record.packId} at ${distanceKm.toFixed(2)}km away`);

      return record.packData as unknown as ReadinessPack;
    } catch (error: any) {
      // 如果 SQL 查询失败（例如数据库不支持），尝试使用简单的坐标范围查询
      this.logger.warn(`Failed to find nearest pack using SQL: ${error.message}, falling back to simple query`);
      
      try {
        // 降级方案：查找所有有坐标的 packs，然后在内存中计算距离
        const allRecords = await this.prisma.readinessPack.findMany({
          where: {
            isActive: true,
            latitude: { not: null },
            longitude: { not: null },
          },
        });

        let nearestPack: ReadinessPack | null = null;
        let minDistance = Infinity;

        for (const record of allRecords) {
          if (record.latitude === null || record.longitude === null) continue;

          const distance = this.calculateHaversineDistance(
            lat,
            lng,
            record.latitude,
            record.longitude
          );

          if (distance < minDistance && distance <= maxDistanceKm) {
            minDistance = distance;
            nearestPack = record.packData as unknown as ReadinessPack;
          }
        }

        return nearestPack;
      } catch (fallbackError: any) {
        this.logger.error(`Failed to find nearest pack: ${fallbackError.message}`);
        return null;
      }
    }
  }

  /**
   * 计算两点之间的 Haversine 距离（公里）
   */
  private calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 将角度转换为弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 保存 Pack 到数据库
   */
  async savePack(pack: ReadinessPack): Promise<boolean> {
    try {
      // 检查是否已存在
      const existing = await this.prisma.readinessPack.findUnique({
        where: { packId: pack.packId },
      });

      // 将 LocalizedString 转换为字符串（用于数据库存储）
      const displayNameStr = typeof pack.displayName === 'string' 
        ? pack.displayName 
        : pack.displayName.en;

      const packData = {
        packId: pack.packId,
        destinationId: pack.destinationId,
        displayName: displayNameStr,
        version: pack.version,
        lastReviewedAt: new Date(pack.lastReviewedAt),
        countryCode: pack.geo.countryCode,
        region: pack.geo.region,
        city: pack.geo.city,
        latitude: pack.geo.lat,
        longitude: pack.geo.lng,
        packData: pack as any, // 存储完整 Pack JSON
        isActive: true,
      };

      if (existing) {
        // 更新现有记录
        await this.prisma.readinessPack.update({
          where: { packId: pack.packId },
          data: packData,
        });
        this.logger.log(`Updated pack: ${pack.packId}`);
      } else {
        // 创建新记录
        await this.prisma.readinessPack.create({
          data: {
            ...packData,
            id: packData.packId || randomUUID(),
            updatedAt: new Date(),
          } as any,
        });
        this.logger.log(`Created pack: ${pack.packId}`);
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to save pack ${pack.packId}: ${error.message}`);
      return false;
    }
  }

  /**
   * 从 JSON 文件导入 Pack 到数据库
   */
  async importPackFromFile(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) {
        this.logger.error(`File not found: ${filePath}`);
        return false;
      }

      const content = readFileSync(filePath, 'utf-8');
      const pack = JSON.parse(content) as ReadinessPack;

      // 基本验证
      if (!pack.packId || !pack.destinationId || !pack.rules) {
        throw new Error('Invalid pack format: missing required fields');
      }

      return await this.savePack(pack);
    } catch (error: any) {
      this.logger.error(`Failed to import pack from file ${filePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * 从目录批量导入 Pack 文件
   */
  async importPacksFromDirectory(directory?: string): Promise<{ success: number; failed: number }> {
    const dir = directory || this.packsDirectory;
    let success = 0;
    let failed = 0;

    try {
      if (!existsSync(dir)) {
        this.logger.warn(`Directory does not exist: ${dir}`);
        return { success: 0, failed: 0 };
      }

      const files = readdirSync(dir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(dir, file);
        const result = await this.importPackFromFile(filePath);

        if (result) {
          success++;
        } else {
          failed++;
        }
      }

      this.logger.log(`Imported ${success} packs, ${failed} failed from ${dir}`);
    } catch (error: any) {
      this.logger.error(`Failed to import packs from directory: ${error.message}`);
    }

    return { success, failed };
  }

  /**
   * 禁用 Pack（软删除）
   */
  async deactivatePack(packId: string): Promise<boolean> {
    try {
      await this.prisma.readinessPack.update({
        where: { packId },
        data: { isActive: false },
      });
      this.logger.log(`Deactivated pack: ${packId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to deactivate pack ${packId}: ${error.message}`);
      return false;
    }
  }

  /**
   * 验证 Pack 格式（基本验证）
   */
  validatePack(pack: ReadinessPack): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 必需字段检查
    if (!pack.packId) errors.push('packId is required');
    if (!pack.destinationId) errors.push('destinationId is required');
    if (!pack.displayName) errors.push('displayName is required');
    if (!pack.version) errors.push('version is required');
    if (!pack.lastReviewedAt) errors.push('lastReviewedAt is required');
    if (!pack.geo) errors.push('geo is required');
    if (!pack.geo.countryCode) errors.push('geo.countryCode is required');
    if (!pack.rules || !Array.isArray(pack.rules)) {
      errors.push('rules must be a non-empty array');
    }
    if (!pack.checklists || !Array.isArray(pack.checklists)) {
      errors.push('checklists must be a non-empty array');
    }

    // 版本格式检查
    if (pack.version && !/^\d+\.\d+\.\d+$/.test(pack.version)) {
      errors.push('version must follow semantic versioning (e.g., 1.0.0)');
    }

    // 规则验证
    if (pack.rules) {
      pack.rules.forEach((rule, index) => {
        if (!rule.id) errors.push(`rules[${index}].id is required`);
        if (!rule.category) errors.push(`rules[${index}].category is required`);
        if (!rule.when) errors.push(`rules[${index}].when is required`);
        if (!rule.then) errors.push(`rules[${index}].then is required`);
        if (!rule.then.level) errors.push(`rules[${index}].then.level is required`);
        if (!rule.then.message) errors.push(`rules[${index}].then.message is required`);
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

