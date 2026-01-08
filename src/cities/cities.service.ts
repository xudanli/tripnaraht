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
      // 如果有搜索关键词，使用原始 SQL 查询以支持不区分大小写搜索
      if (q) {
        const searchTerm = q.trim();
        // 使用 PostgreSQL 的 LOWER() 和 LIKE 进行不区分大小写搜索
        const cities = await this.prisma.$queryRaw<any[]>`
          SELECT *
          FROM "City"
          WHERE 
            ${countryCode ? Prisma.sql`"countryCode" = ${countryCode.toUpperCase()} AND` : Prisma.sql``}
            (
              LOWER(COALESCE("nameCN", '')) LIKE LOWER(${`%${searchTerm}%`}) OR
              LOWER(COALESCE("nameEN", '')) LIKE LOWER(${`%${searchTerm}%`}) OR
              LOWER("name") LIKE LOWER(${`%${searchTerm}%`})
            )
          ORDER BY "countryCode" ASC, "name" ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        return cities.map(city => this.mapToDto(city));
      }

      // 如果没有搜索关键词，使用标准 Prisma 查询
      const where: Prisma.CityWhereInput = {};

      // 国家代码过滤
      if (countryCode) {
        where.countryCode = countryCode.toUpperCase();
      }

      // 查询城市
      const cities = await this.prisma.city.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [
          { countryCode: 'asc' },
          { name: 'asc' },
        ],
      });

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
