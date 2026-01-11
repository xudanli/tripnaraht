// src/cities/cities.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CityDto, GetCitiesQueryDto } from './dto/city.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CitiesService {
  private readonly logger = new Logger(CitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取城市列表
   * 支持按国家代码过滤和关键词搜索
   */
  async findAll(query: GetCitiesQueryDto): Promise<CityDto[]> {
    const { countryCode, q, limit = 50, offset = 0 } = query;

    try {
      // 添加详细的输入日志
      this.logger.debug(`[CitiesService.findAll] 收到查询参数: ${JSON.stringify({ countryCode, q, limit, offset })}`);
      
      // 规范化国家代码（转换为大写）
      const normalizedCountryCode = countryCode ? countryCode.toUpperCase().trim() : undefined;
      
      // 添加调试日志
      if (normalizedCountryCode) {
        this.logger.debug(`[CitiesService.findAll] 规范化后的国家代码: ${normalizedCountryCode}`);
      } else {
        this.logger.debug(`[CitiesService.findAll] 未提供国家代码，将返回所有城市`);
      }

      // 如果有搜索关键词，使用原始 SQL 查询以支持不区分大小写搜索
      if (q) {
        const searchTerm = q.trim();
        // 使用 PostgreSQL 的 LOWER() 和 LIKE 进行不区分大小写搜索
        const cities = await this.prisma.$queryRaw<any[]>`
          SELECT *
          FROM "City"
          WHERE 
            ${normalizedCountryCode ? Prisma.sql`"countryCode" = ${normalizedCountryCode} AND` : Prisma.sql``}
            (
              LOWER(COALESCE("nameCN", '')) LIKE LOWER(${`%${searchTerm}%`}) OR
              LOWER(COALESCE("nameEN", '')) LIKE LOWER(${`%${searchTerm}%`}) OR
              LOWER("name") LIKE LOWER(${`%${searchTerm}%`})
            )
          ORDER BY "countryCode" ASC, "name" ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        
        // 添加调试日志
        if (normalizedCountryCode) {
          this.logger.debug(`搜索城市结果: 找到 ${cities.length} 个城市 (countryCode=${normalizedCountryCode})`);
        }
        
        return cities.map(city => this.mapToDto(city));
      }

      // 如果没有搜索关键词，使用标准 Prisma 查询
      // 如果提供了国家代码，使用原始 SQL 查询确保过滤条件生效（临时修复）
      if (normalizedCountryCode) {
        this.logger.debug(`[CitiesService.findAll] 使用原始 SQL 查询（带国家代码过滤）: countryCode=${normalizedCountryCode}`);
        
        // 使用参数化查询确保安全，排除 location 字段（geography 类型无法反序列化）
        const cities = await this.prisma.$queryRaw<any[]>`
          SELECT 
            id, name, "countryCode", adcode, "nameCN", "nameEN", timezone, metadata
          FROM "City" 
          WHERE "countryCode" = ${normalizedCountryCode}::text
          ORDER BY "countryCode" ASC, "name" ASC
          LIMIT ${limit}::int
          OFFSET ${offset}::int
        `;
        
        this.logger.debug(`[CitiesService.findAll] 原始 SQL 查询结果: ${cities.length} 个城市 (countryCode=${normalizedCountryCode})`);
        if (cities.length > 0) {
          const actualCountryCodes = [...new Set(cities.map(c => c.countryCode))];
          this.logger.debug(`[CitiesService.findAll] 返回的城市国家代码: ${actualCountryCodes.join(', ')}`);
          if (!actualCountryCodes.includes(normalizedCountryCode)) {
            this.logger.error(`[CitiesService.findAll] 严重错误！查询 countryCode=${normalizedCountryCode}，但返回的城市 countryCode 为: ${actualCountryCodes.join(', ')}`);
          }
        } else {
          this.logger.warn(`[CitiesService.findAll] 未找到国家代码为 ${normalizedCountryCode} 的城市`);
        }
        
        return cities.map(city => this.mapToDto(city));
      }

      // 如果没有国家代码，使用标准 Prisma 查询
      const where: Prisma.CityWhereInput = {};
      this.logger.debug(`[CitiesService.findAll] 使用 Prisma 查询（无国家代码过滤）: where=${JSON.stringify(where)}`);
      
      const cities = await this.prisma.city.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [
          { countryCode: 'asc' },
          { name: 'asc' },
        ],
      });
      
      this.logger.debug(`[CitiesService.findAll] Prisma findMany 查询结果: ${cities.length} 个城市`);
      
      // 添加调试日志，检查返回的城市
      if (normalizedCountryCode && cities.length > 0) {
        const actualCountryCodes = [...new Set(cities.map(c => c.countryCode))];
        if (actualCountryCodes.length > 0 && !actualCountryCodes.includes(normalizedCountryCode)) {
          this.logger.warn(`查询条件未生效！查询 countryCode=${normalizedCountryCode}，但返回的城市 countryCode 为: ${actualCountryCodes.join(', ')}`);
        }
      }

      // 添加调试日志
      if (normalizedCountryCode) {
        this.logger.debug(`查询城市结果: 找到 ${cities.length} 个城市 (countryCode=${normalizedCountryCode})`);
        if (cities.length === 0) {
          // 检查数据库中是否有该国家的城市
          const totalCount = await this.prisma.city.count({
            where: { countryCode: normalizedCountryCode },
          });
          this.logger.warn(`未找到国家代码为 ${normalizedCountryCode} 的城市。数据库中该国家的城市总数: ${totalCount}`);
          
          // 列出数据库中实际存在的国家代码（用于调试）
          const distinctCountries = await this.prisma.city.findMany({
            select: { countryCode: true },
            distinct: ['countryCode'],
            take: 10,
          });
          this.logger.debug(`数据库中存在的国家代码示例: ${distinctCountries.map(c => c.countryCode).join(', ')}`);
        }
      }

      // 转换为 DTO
      return cities.map(city => this.mapToDto(city));
    } catch (error: any) {
      this.logger.error(`Failed to find cities: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取城市详情
   */
  async findOne(id: number): Promise<CityDto> {
    try {
      const city = await this.prisma.city.findUnique({
        where: { id },
      });

      if (!city) {
        throw new NotFoundException(`城市 ID ${id} 不存在`);
      }

      return this.mapToDto(city);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to find city ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 将数据库模型转换为 DTO
   */
  private mapToDto(city: any): CityDto {
    // 从 location 字段提取坐标（如果是 PostGIS geography 类型）
    let lat: number | undefined;
    let lng: number | undefined;

    if (city.location) {
      // 如果 location 是字符串格式 (POINT(lng lat))
      if (typeof city.location === 'string') {
        const match = city.location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lngStr, latStr] = match[1].split(/\s+/);
          lng = parseFloat(lngStr);
          lat = parseFloat(latStr);
        }
      }
      // 如果 location 是对象格式
      else if (typeof city.location === 'object') {
        if (city.location.coordinates && Array.isArray(city.location.coordinates)) {
          lng = city.location.coordinates[0];
          lat = city.location.coordinates[1];
        }
        if (city.location.lat && city.location.lng) {
          lat = city.location.lat;
          lng = city.location.lng;
        }
      }
    }

    return {
      id: city.id,
      name: city.name,
      countryCode: city.countryCode,
      nameCN: city.nameCN || undefined,
      nameEN: city.nameEN || undefined,
      adcode: city.adcode || undefined,
      timezone: city.timezone || undefined,
      lat,
      lng,
      metadata: city.metadata || undefined,
    };
  }

  /**
   * 获取某个国家的所有城市数量
   */
  async countByCountry(countryCode: string): Promise<number> {
    try {
      return await this.prisma.city.count({
        where: {
          countryCode: countryCode.toUpperCase(),
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to count cities by country ${countryCode}: ${error.message}`);
      return 0;
    }
  }
}
