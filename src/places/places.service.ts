// src/places/places.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PlaceWithDistance, RawPlaceResult } from './dto/geo-result.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { PlaceMetadata } from './interfaces/place-metadata.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class PlacesService {
  constructor(private prisma: PrismaService) {}

  /**
   * 创建地点
   */
  async createPlace(dto: CreatePlaceDto) {
    const { lat, lng, ...rest } = dto;
    
    // ⚠️ 注意：Prisma 不支持直接写入 Unsupported 字段
    // 我们通常创建一个带有经纬度的 Place，然后用 raw SQL 更新它的 location，
    // 或者直接使用 $executeRaw 进行插入。
    // 简便方法：先创建基础信息
    const place = await this.prisma.place.create({
      data: {
        ...rest,
        uuid: randomUUID(),
        metadata: dto.metadata as any, // 存入 JSON
        updatedAt: new Date(),
      } as any, // Use UncheckedCreateInput to allow direct foreign key assignment
    });

    // 更新地理位置 (使用 PostGIS 函数 ST_MakePoint)
    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      WHERE id = ${place.id}
    `;

    return place;
  }

  /**
   * 封装好的"查找附近"方法
   * 看起来就像普通的 ORM 方法一样清爽
   */
  async findNearby(
    lat: number, 
    lng: number, 
    radius: number = 2000, // 默认 2km
    category?: 'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL' // 可选过滤
  ): Promise<PlaceWithDistance[]> {
    
    // 1. 动态构建 SQL 条件 (如果需要复杂的动态查询，这里可以拼接数组)
    // 注意：Prisma.sql 用于安全拼接
    const categoryFilter = category 
      ? Prisma.sql`AND category = ${category}::"PlaceCategory"` 
      : Prisma.sql``;

    // 2. 执行 Raw SQL
    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        id, 
        name, 
        category,
        metadata,
        address,
        rating,
        -- 使用 PostGIS 计算球面距离 (单位：米)
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters
      FROM "Place"
      WHERE 
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radius}
        )
        ${categoryFilter} -- 注入上面的动态条件
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;

    // 3. 数据清洗 (Mapping)
    // 将数据库的原始 JSONB 转换为前端友好的格式
    return rawResults.map((row) => this.mapToDto(row));
  }

  /**
   * 查找附近支持特定支付方式的餐厅
   */
  async findNearbyRestaurants(
    lat: number, 
    lng: number, 
    radiusMeters: number = 1000,
    paymentMethod?: string
  ): Promise<PlaceWithDistance[]> {
    // 构建支付方式过滤条件
    const paymentFilter = paymentMethod
      ? Prisma.sql`AND metadata->'facilities'->'payment' ? ${paymentMethod}`
      : Prisma.sql``;

    const rawResults = await this.prisma.$queryRaw<RawPlaceResult[]>`
      SELECT 
        id, name, metadata, address, rating,
        ST_Distance(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) as distance_meters,
        category
      FROM "Place"
      WHERE 
        -- 1. 地理筛选
        ST_DWithin(
          location, 
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 
          ${radiusMeters}
        )
        AND
        -- 2. 类别筛选
        category = 'RESTAURANT'
        ${paymentFilter}
      ORDER BY distance_meters ASC
      LIMIT 50;
    `;

    return rawResults.map((row) => this.mapToDto(row));
  }

  /**
   * 数据映射：将数据库原始结果转换为 DTO
   */
  private mapToDto(row: RawPlaceResult): PlaceWithDistance {
    const meta = row.metadata as PlaceMetadata;
    
    // 1. 获取今天是星期几 (店铺当地时间)
    // 假设店铺都在日本 (或者从 row.city.timezone 获取)
    const timezone = meta?.timezone || 'Asia/Tokyo'; 
    const todayHours = OpeningHoursUtil.getTodayHours(meta, timezone);
    
    // 2. 计算状态
    const isOpen = OpeningHoursUtil.isOpenNow(todayHours, timezone);
    
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      distance: Math.round(row.distance_meters), // 取整
      address: row.address,
      rating: row.rating,
      // 提取 JSONB 里的关键信息到顶层，方便前端直接用
      isOpen: isOpen,
      tags: meta?.facilities?.payment || [],
      status: {
        isOpen: isOpen,
        text: isOpen ? '营业中' : '已打烊',
        hoursToday: todayHours || '休息',
      }
    };
  }

  /**
   * 一个辅助函数示例：判断当前是否营业
   */
  private checkIfOpen(openingHours: any): boolean {
    // 这里写解析 "Mon-Fri 09:00-18:00" 的逻辑
    return true; // 占位
  }
}

