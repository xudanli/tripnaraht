// src/trips/trips.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { DateTime } from 'luxon';
import { PacingCalculator } from './utils/pacing-calculator.util';
import { FlightPriceService } from './services/flight-price.service';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private flightPriceService: FlightPriceService
  ) {}

  /**
   * 创建行程
   * 
   * 核心功能：
   * 1. 计算行程天数
   * 2. 木桶效应计算（Pacing Strategy）
   * 3. 预算切分（Budget Strategy）
   * 4. 自动创建 TripDay 记录
   * 
   * @param dto 创建行程的输入数据
   * @returns 创建成功的 Trip 对象
   */
  async create(dto: CreateTripDto) {
    // ============================================
    // 步骤 1: 计算行程天数
    // ============================================
    const start = DateTime.fromISO(dto.startDate);
    const end = DateTime.fromISO(dto.endDate);

    // 验证日期有效性
    if (!start.isValid) {
      throw new BadRequestException(`无效的开始日期: ${dto.startDate}`);
    }
    if (!end.isValid) {
      throw new BadRequestException(`无效的结束日期: ${dto.endDate}`);
    }
    if (end <= start) {
      throw new BadRequestException('结束日期必须晚于开始日期');
    }

    // 计算天数（包含首尾两天）
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;

    if (durationDays < 1) {
      throw new BadRequestException('行程天数必须至少为 1 天');
  }

    // ============================================
    // 步骤 2: 🧠 策略一：木桶效应计算 (Pacing Strategy)
    // ============================================
    // 使用新的双轴模型 + 木桶效应算法
    // 根据团队中最弱的成员决定整体节奏
    const pacingConfig = PacingCalculator.calculateShortestStave(dto.travelers);

    // ============================================
    // 步骤 3: 🧠 策略二：预算切分 (Budget Strategy)
    // ============================================
    // 从估算数据库查询机票+签证费用（保守估算：使用旺季价格）
    const estimatedFlightVisa = await this.flightPriceService.getEstimatedCost(
      dto.destination,
      undefined, // 暂时不指定出发城市，后续可以从 DTO 中获取
      true // 使用保守估算（旺季价格）
    );
    
    const remainingBudget = dto.totalBudget - estimatedFlightVisa;
    const dailyBudget = remainingBudget / durationDays;
    
    // 根据每日预算推导酒店档次
    // 这个逻辑可以根据实际需求调整
    let hotelTier = '3-Star';
    if (dailyBudget > 3000) {
      hotelTier = '5-Star';
    } else if (dailyBudget > 1500) {
      hotelTier = '4-Star';
  }

    const budgetConfig = {
      total: dto.totalBudget,
      currency: 'CNY', // 人民币
      estimated_flight_visa: estimatedFlightVisa,
      remaining_for_ground: remainingBudget,
      daily_budget: Math.round(dailyBudget),
      hotel_tier_recommendation: hotelTier
    };

    // ============================================
    // 步骤 4: 写入数据库 (使用 Transaction 保证原子性)
    // ============================================
    // 使用事务确保 Trip 和 TripDay 要么全部创建成功，要么全部失败
    return this.prisma.$transaction(async (tx) => {
      // A. 创建 Trip 主记录
      const trip = await tx.trip.create({
        data: {
          destination: dto.destination,
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          budgetConfig: budgetConfig as any,
          pacingConfig: pacingConfig as any,
        },
      });

      // B. 自动生成每一天的容器 (TripDay)
      // 为每一天创建一个空的行程容器，后续可以添加具体的活动
      const tripDays = [];
      for (let i = 0; i < durationDays; i++) {
        const dayDate = start.plus({ days: i });
        const tripDay = await tx.tripDay.create({
          data: {
            date: dayDate.toJSDate(),
            tripId: trip.id,
          },
        });
        tripDays.push(tripDay);
      }

      // 返回完整的 Trip 对象（包含关联的 TripDay）
      return {
        ...trip,
        days: tripDays,
      };
    });
  }


  /**
   * 查找所有行程
   */
  async findAll() {
    return this.prisma.trip.findMany({
      include: {
        days: {
          include: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * 根据 ID 查找单个行程（全景视图）
   * 
   * 返回完整的行程树形结构：
   * - Trip
   *   - Days (按日期排序)
   *     - Items (按时间排序)
   *       - Place (地点详情)
   * 
   * 同时包含数据增强（统计信息）
   */
  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        // 第一层：关联查询所有的 Days
        days: {
          orderBy: { date: 'asc' }, // 按日期排序
          include: {
            // 第二层：关联查询每天下面的 Items
            items: {
              orderBy: { startTime: 'asc' }, // 按时间轴排序 (9点在10点前)
              include: {
                // 第三层：关联查询 Item 对应的地点详情 (如果有)
                place: {
                  // 使用 include 返回所有字段，包括 nameEN
                  // 前端需要：name, nameEN, category, location, metadata, physicalMetadata, rating
                }
              }
            }
          }
        }
      }
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${id} 不存在`);
    }

    // 数据增强 (Data Enrichment)
    // 计算统计信息、进度状态等
    return this.enrichTripData(trip);
  }

  /**
   * 数据增强：为行程添加统计信息和状态
   * 
   * 功能：
   * - 计算总天数、总活动数
   * - 判断行程状态（规划中/进行中/已完成）
   * - 计算预算使用情况
   * - 其他可扩展的统计信息
   * 
   * @param trip 原始行程数据
   * @returns 增强后的行程数据
   */
  private enrichTripData(trip: any) {
    let totalItems = 0;
    let totalActivities = 0;
    let totalMeals = 0;
    let totalRest = 0;
    let totalTransit = 0;
    const now = new Date();

    // 遍历所有日期，统计信息
    trip.days.forEach((day: any) => {
      totalItems += day.items.length;
      
      day.items.forEach((item: any) => {
        switch (item.type) {
          case 'ACTIVITY':
            totalActivities++;
            break;
          case 'MEAL_ANCHOR':
          case 'MEAL_FLOATING':
            totalMeals++;
            break;
          case 'REST':
            totalRest++;
            break;
          case 'TRANSIT':
            totalTransit++;
            break;
        }
      });
    });

    // 判断行程状态
    let progress: 'PLANNING' | 'ONGOING' | 'COMPLETED' = 'PLANNING';
    if (trip.startDate && trip.endDate) {
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      
      if (now < startDate) {
        progress = 'PLANNING'; // 规划中
      } else if (now >= startDate && now <= endDate) {
        progress = 'ONGOING'; // 进行中
      } else {
        progress = 'COMPLETED'; // 已完成
      }
    }

    // 计算已安排的天数（有活动的天数）
    const daysWithActivities = trip.days.filter((day: any) => day.items.length > 0).length;

    // 计算预算使用情况（如果有预算配置）
    const budgetConfig = trip.budgetConfig as any;
    let budgetStats = null;
    if (budgetConfig) {
      // 这里可以扩展：根据已安排的活动估算费用
      // 目前只返回预算配置
      budgetStats = {
        total: budgetConfig.total,
        currency: budgetConfig.currency || 'CNY',
        daily_budget: budgetConfig.daily_budget,
        hotel_tier_recommendation: budgetConfig.hotel_tier_recommendation,
        // 可以添加：estimated_spent, remaining_budget 等
      };
    }

    return {
      ...trip,
      stats: {
        totalDays: trip.days.length,
        daysWithActivities: daysWithActivities,
        totalItems: totalItems,
        totalActivities: totalActivities,
        totalMeals: totalMeals,
        totalRest: totalRest,
        totalTransit: totalTransit,
        progress: progress,
        budgetStats: budgetStats,
      }
    };
  }
}
