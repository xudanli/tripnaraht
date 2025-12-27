// src/trips/trips.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { DateTime } from 'luxon';
import { PacingCalculator } from './utils/pacing-calculator.util';
import { FlightPriceService } from './services/flight-price.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private flightPriceService: FlightPriceService,
    private scheduleConverter: ScheduleConverterService,
    private actionHistory: ActionHistoryService
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
      totalBudget: dto.totalBudget, // 使用 totalBudget 保持一致性
      currency: 'CNY', // 人民币
      estimated_flight_visa: estimatedFlightVisa,
      remaining_for_ground: remainingBudget,
      daily_budget: Math.round(dailyBudget),
      hotel_tier_recommendation: hotelTier,
      travelers: dto.travelers.map(t => ({
        type: t.type,
        mobilityTag: t.mobilityTag,
      })), // 保存旅行者信息，用于时间价值计算
    };

    // ============================================
    // 步骤 4: 写入数据库 (使用 Transaction 保证原子性)
    // ============================================
    // 使用事务确保 Trip 和 TripDay 要么全部创建成功，要么全部失败
    return this.prisma.$transaction(async (tx) => {
      // A. 创建 Trip 主记录
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          destination: dto.destination,
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          budgetConfig: budgetConfig as any,
          pacingConfig: pacingConfig as any,
          updatedAt: new Date(),
        } as any, // Use UncheckedCreateInput to allow direct field assignment
      });

      // B. 自动生成每一天的容器 (TripDay)
      // 为每一天创建一个空的行程容器，后续可以添加具体的活动
      const tripDays = [];
      for (let i = 0; i < durationDays; i++) {
        const dayDate = start.plus({ days: i });
        const tripDay = await tx.tripDay.create({
          data: {
            id: randomUUID(),
            date: dayDate.toJSDate(),
            tripId: trip.id,
          } as any, // Use UncheckedCreateInput to allow direct foreign key assignment
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
        TripDay: {
          include: {
            ItineraryItem: true,
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
        TripDay: {
          orderBy: { date: 'asc' }, // 按日期排序
          include: {
            // 第二层：关联查询每天下面的 Items
            ItineraryItem: {
              orderBy: { startTime: 'asc' }, // 按时间轴排序 (9点在10点前)
              include: {
                // 第三层：关联查询 Item 对应的地点详情 (如果有)
                Place: {
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
    trip.TripDay.forEach((day: any) => {
      totalItems += day.ItineraryItem.length;
      
      day.ItineraryItem.forEach((item: any) => {
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
    const daysWithActivities = trip.TripDay.filter((day: any) => day.ItineraryItem.length > 0).length;

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
        totalDays: trip.TripDay.length,
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

  /**
   * 获取行程当前状态
   * 
   * @param tripId 行程 ID
   * @param nowISO 当前时间（ISO 格式，可选，默认使用服务器时间）
   * @returns 行程当前状态
   */
  async getTripState(tripId: string, nowISO?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
              orderBy: { startTime: 'asc' },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const now = nowISO ? DateTime.fromISO(nowISO) : DateTime.now();
    const timezone = 'Asia/Tokyo'; // TODO: 从 trip 或 city 获取时区

    // 找到当前日期
    let currentDayId: string | null = null;
    let currentItemId: string | null = null;
    let nextStop: any = null;

    for (const day of trip.TripDay) {
      const dayDate = DateTime.fromJSDate(day.date);
      if (dayDate.hasSame(now, 'day')) {
        currentDayId = day.id;

        // 找到当前或下一个行程项
        for (const item of day.ItineraryItem) {
          if (!item.startTime || !item.endTime) continue;

          const startTime = DateTime.fromJSDate(item.startTime);
          const endTime = DateTime.fromJSDate(item.endTime);

          if (now >= startTime && now <= endTime) {
            // 当前正在进行的项
            currentItemId = item.id;
          } else if (now < startTime && !nextStop) {
            // 下一个项
            nextStop = {
              itemId: item.id,
              placeId: item.placeId,
              placeName: item.Place?.nameEN || item.Place?.nameCN || '未知地点',
              startTime: startTime.toISO(),
              estimatedArrivalTime: startTime.toISO(),
            };
            break;
          }
        }

        // 如果没找到当前项，找第一个未来的项
        if (!currentItemId && !nextStop && day.ItineraryItem.length > 0) {
          const firstItem = day.ItineraryItem.find(item => item.startTime && DateTime.fromJSDate(item.startTime) > now);
          if (firstItem && firstItem.startTime) {
            const startTime = DateTime.fromJSDate(firstItem.startTime);
            nextStop = {
              itemId: firstItem.id,
              placeId: firstItem.placeId,
              placeName: firstItem.Place?.nameEN || firstItem.Place?.nameCN || '未知地点',
              startTime: startTime.toISO(),
              estimatedArrivalTime: startTime.toISO(),
            };
          }
        }

        break;
      }
    }

    return {
      currentDayId,
      currentItemId,
      nextStop,
      timezone,
      now: now.toISO(),
    };
  }

  /**
   * 获取指定日期的 Schedule
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（YYYY-MM-DD）
   * @returns Schedule 或 null
   */
  async getSchedule(tripId: string, dateISO: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const date = DateTime.fromISO(dateISO);
    const tripDay = trip.TripDay.find(day => {
      const dayDate = DateTime.fromJSDate(day.date);
      return dayDate.hasSame(date, 'day');
    });

    if (!tripDay) {
      return {
        date: dateISO,
        schedule: null,
        persisted: false,
      };
    }

    const schedule = await this.scheduleConverter.loadScheduleFromDatabase(
      tripDay.id,
      dateISO
    );

    return {
      date: dateISO,
      schedule,
      persisted: schedule !== null,
    };
  }

  /**
   * 保存指定日期的 Schedule
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（YYYY-MM-DD）
   * @param schedule DayScheduleResult
   */
  async saveSchedule(tripId: string, dateISO: string, schedule: DayScheduleResult) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const date = DateTime.fromISO(dateISO);
    let tripDay = trip.TripDay.find(day => {
      const dayDate = DateTime.fromJSDate(day.date);
      return dayDate.hasSame(date, 'day');
    });

    // 如果不存在该日期，创建一个新的 TripDay
    if (!tripDay) {
      tripDay = await this.prisma.tripDay.create({
        data: {
          id: randomUUID(),
          date: date.toJSDate(),
          tripId: trip.id,
        } as any,
      });
    }

    // 保存 Schedule 到数据库
    await this.scheduleConverter.saveScheduleToDatabase(
      tripId,
      tripDay.id,
      schedule,
      dateISO
    );

    return {
      date: dateISO,
      schedule,
      persisted: true,
    };
  }

  /**
   * 获取操作历史
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（可选）
   * @returns 操作历史列表
   */
  async getActionHistory(tripId: string, dateISO?: string) {
    return this.actionHistory.getActionHistory(tripId, dateISO);
  }

  /**
   * 撤销操作
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期
   * @returns 撤销后的 Schedule
   */
  async undoAction(tripId: string, dateISO: string) {
    return this.actionHistory.undoAction(tripId, dateISO);
  }

  /**
   * 重做操作
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期
   * @returns 重做后的 Schedule
   */
  async redoAction(tripId: string, dateISO: string) {
    return this.actionHistory.redoAction(tripId, dateISO);
  }
}
