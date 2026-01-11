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
   * 返回城市列表和分页信息
   */
  async findAll(query: GetCitiesQueryDto): Promise<{
    cities: CityDto[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  }> {
    // 限制limit最大值，防止性能问题
    const maxLimit = 1000;
    let { countryCode, q, limit = 50, offset = 0 } = query;
    
    // 限制limit不超过最大值
    if (limit > maxLimit) {
      limit = maxLimit;
      this.logger.warn(`[CitiesService.findAll] limit超过最大值${maxLimit}，已自动调整为${maxLimit}`);
    }

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

      // 如果有搜索关键词，使用 Prisma 查询以支持不区分大小写搜索
      if (q) {
        const searchTerm = q.trim();
        const searchPattern = `%${searchTerm}%`;
        
        // 构建 where 条件
        const whereCondition: Prisma.CityWhereInput = {
          OR: [
            { nameCN: { contains: searchTerm, mode: 'insensitive' } },
            { nameEN: { contains: searchTerm, mode: 'insensitive' } },
            { name: { contains: searchTerm, mode: 'insensitive' } },
          ],
        };
        
        if (normalizedCountryCode) {
          whereCondition.countryCode = normalizedCountryCode;
        }
        
        // 查询总数
        const total = await this.prisma.city.count({
          where: whereCondition,
        });
        
        // 查询城市列表
        const cities = await this.prisma.city.findMany({
          where: whereCondition,
          take: limit,
          skip: offset,
          orderBy: [
            { countryCode: 'asc' },
            { name: 'asc' },
          ],
        });
        
        const cityDtos = cities.map(city => this.mapToDto(city));
        const hasMore = offset + cityDtos.length < total;
        
        // 添加调试日志
        this.logger.debug(`搜索城市结果: 找到 ${cityDtos.length} 个城市 (searchTerm=${searchTerm}, countryCode=${normalizedCountryCode || 'all'}, total=${total}, hasMore=${hasMore})`);
        
        return {
          cities: cityDtos,
          total,
          hasMore,
          limit,
          offset,
        };
      }

      // 如果没有搜索关键词，使用标准 Prisma 查询
      // 如果提供了国家代码，使用 Prisma 查询（更可靠）
      if (normalizedCountryCode) {
        this.logger.debug(`[CitiesService.findAll] 使用 Prisma 查询（带国家代码过滤）: countryCode=${normalizedCountryCode}, limit=${limit}, offset=${offset}`);
        
        // 明确构建 where 条件
        const whereCondition = {
          countryCode: normalizedCountryCode,
        };
        
        // 查询总数
        const total = await this.prisma.city.count({
          where: whereCondition,
        });
        
        // 查询城市列表
        const cities = await this.prisma.city.findMany({
          where: whereCondition,
          take: limit,
          skip: offset,
          orderBy: [
            { countryCode: 'asc' },
            { name: 'asc' },
          ],
        });
        
        const cityDtos = cities.map(city => this.mapToDto(city));
        const hasMore = offset + cityDtos.length < total;
        
        this.logger.debug(`[CitiesService.findAll] ✅ Prisma 查询结果: ${cityDtos.length} 个城市 (countryCode=${normalizedCountryCode}, total=${total}, hasMore=${hasMore})`);
        
        return {
          cities: cityDtos,
          total,
          hasMore,
          limit,
          offset,
        };
      }

      // 如果没有国家代码，使用标准 Prisma 查询
      const where: Prisma.CityWhereInput = {};
      this.logger.debug(`[CitiesService.findAll] 使用 Prisma 查询（无国家代码过滤）: where=${JSON.stringify(where)}`);
      
      // 查询总数
      const total = await this.prisma.city.count({ where });
      
      // 查询城市列表
      const cities = await this.prisma.city.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [
          { countryCode: 'asc' },
          { name: 'asc' },
        ],
      });
      
      const cityDtos = cities.map(city => this.mapToDto(city));
      const hasMore = offset + cityDtos.length < total;
      
      this.logger.debug(`[CitiesService.findAll] Prisma findMany 查询结果: ${cityDtos.length} 个城市 (total=${total}, hasMore=${hasMore})`);

      return {
        cities: cityDtos,
        total,
        hasMore,
        limit,
        offset,
      };
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
