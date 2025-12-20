// src/trips/readiness/storage/pack-storage.service.ts

/**
 * Pack Storage Service
 * 
 * 负责 Readiness Pack 的存储和加载
 * 使用数据库存储，支持从 JSON 文件导入
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
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
      const pack = record.packData as ReadinessPack;
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

      return records.map(record => record.packData as ReadinessPack);
    } catch (error: any) {
      this.logger.error(`Failed to find packs by country ${countryCode}: ${error.message}`);
      return [];
    }
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

      const packData = {
        packId: pack.packId,
        destinationId: pack.destinationId,
        displayName: pack.displayName,
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
          data: packData,
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

