// src/agent/services/planning-workbench-admin.service.ts
/**
 * Planning Workbench Admin Service
 * 
 * 用于后台管理规划工作台的规划方案（PlanningPlan）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlanningWorkbenchAdminService {
  private readonly logger = new Logger(PlanningWorkbenchAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分页查询规划会话（通过 PlanningPlan 关联 Trip）
   */
  async getSessions(filters: {
    tripId?: string;
    userId?: string;
    status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    // 如果提供了 userId，需要通过 Trip 关联查询
    if (filters.userId) {
      where.Trip = {
        TripCollaborator: {
          some: {
            userId: filters.userId,
          },
        },
      };
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    let total = 0;
    let plans: any[] = [];

    try {
      total = await this.prisma.planningPlan.count({ where });

      plans = await this.prisma.planningPlan.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          Trip: {
            select: {
              id: true,
              destination: true,
              startDate: true,
              endDate: true,
              status: true,
              TripCollaborator: {
                select: {
                  userId: true,
                  role: true,
                },
              },
            },
          },
        },
      });
    } catch (error: any) {
      // 如果表不存在，返回空结果
      if (error.message?.includes('does not exist') || error.message?.includes('planning_plans')) {
        this.logger.warn('planning_plans 表不存在，返回空结果。请运行数据库迁移创建表。');
        return {
          items: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      throw error;
    }

    const items = plans.map(plan => ({
      id: plan.id,
      tripId: plan.tripId,
      planVersion: plan.planVersion,
      status: plan.status,
      summary: plan.summary || {},
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      createdBy: plan.createdBy,
      trip: {
        id: plan.Trip.id,
        destination: plan.Trip.destination,
        startDate: plan.Trip.startDate.toISOString(),
        endDate: plan.Trip.endDate.toISOString(),
        status: plan.Trip.status,
        collaborators: plan.Trip.TripCollaborator,
      },
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取规划会话详情
   */
  async getSessionById(sessionId: string): Promise<any | null> {
    let plan: any = null;

    try {
      plan = await this.prisma.planningPlan.findUnique({
        where: { id: sessionId },
        include: {
          Trip: {
            include: {
              TripCollaborator: {
                select: {
                  userId: true,
                  role: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    } catch (error: any) {
      // 如果表不存在，返回 null
      if (error.message?.includes('does not exist') || error.message?.includes('planning_plans')) {
        this.logger.warn('planning_plans 表不存在。请运行数据库迁移创建表。');
        return null;
      }
      throw error;
    }

    if (!plan) {
      return null;
    }

    return {
      id: plan.id,
      tripId: plan.tripId,
      planVersion: plan.planVersion,
      status: plan.status,
      planState: plan.planState,
      uiOutput: plan.uiOutput || {},
      summary: plan.summary || {},
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      createdBy: plan.createdBy,
      trip: {
        id: plan.Trip.id,
        destination: plan.Trip.destination,
        startDate: plan.Trip.startDate.toISOString(),
        endDate: plan.Trip.endDate.toISOString(),
        status: plan.Trip.status,
        collaborators: plan.Trip.TripCollaborator,
      },
    };
  }

  /**
   * 获取规划会话统计
   */
  async getSessionStats(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    let total = 0;
    let byStatus: any[] = [];
    let plans: any[] = [];

    try {
      total = await this.prisma.planningPlan.count({ where });

      byStatus = (await (this.prisma.planningPlan as any).groupBy({
        by: ['status'],
        where,
        _count: true,
      })) as any[];

      // 计算平均会话时长（从创建到更新）
      plans = await this.prisma.planningPlan.findMany({
        where,
        select: {
          createdAt: true,
          updatedAt: true,
          status: true,
        },
      });
    } catch (error: any) {
      // 如果表不存在，返回空统计
      if (error.message?.includes('does not exist') || error.message?.includes('planning_plans')) {
        this.logger.warn('planning_plans 表不存在，返回空统计。请运行数据库迁移创建表。');
        return {
          summary: {
            totalSessions: 0,
            lockedSessions: 0,
            draftSessions: 0,
            proposedSessions: 0,
            needConfirmSessions: 0,
            successRate: 0,
            avgDuration: 0,
          },
          byStatus: [],
        };
      }
      throw error;
    }

    const durations = plans
      .map(plan => Math.floor((plan.updatedAt.getTime() - plan.createdAt.getTime()) / 1000))
      .filter(d => d > 0);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // 计算成功率（LOCKED 状态视为成功）
    const successCount = byStatus.find(s => s.status === 'LOCKED')?._count || 0;
    const successRate = total > 0 ? successCount / total : 0;

    return {
      summary: {
        totalSessions: total,
        lockedSessions: byStatus.find(s => s.status === 'LOCKED')?._count || 0,
        draftSessions: byStatus.find(s => s.status === 'DRAFT')?._count || 0,
        proposedSessions: byStatus.find(s => s.status === 'PROPOSED')?._count || 0,
        needConfirmSessions: byStatus.find(s => s.status === 'NEED_CONFIRM')?._count || 0,
        successRate,
        avgDuration,
      },
      byStatus: byStatus.map(s => ({
        status: s.status,
        count: s._count,
        percentage: total > 0 ? (s._count / total) * 100 : 0,
      })),
    };
  }

  /**
   * 分页查询规划方案列表
   */
  async getPlans(filters: {
    tripId?: string;
    status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    let total = 0;
    let plans: any[] = [];

    try {
      total = await this.prisma.planningPlan.count({ where });

      plans = await this.prisma.planningPlan.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          Trip: {
            select: {
              id: true,
              destination: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      });
    } catch (error: any) {
      // 如果表不存在，返回空结果
      if (error.message?.includes('does not exist') || error.message?.includes('planning_plans')) {
        this.logger.warn('planning_plans 表不存在，返回空结果。请运行数据库迁移创建表。');
        return {
          items: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      throw error;
    }

    const items = plans.map(plan => ({
      id: plan.id,
      tripId: plan.tripId,
      planVersion: plan.planVersion,
      status: plan.status,
      summary: plan.summary || {},
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      createdBy: plan.createdBy,
      trip: {
        id: plan.Trip.id,
        destination: plan.Trip.destination,
        startDate: plan.Trip.startDate.toISOString(),
        endDate: plan.Trip.endDate.toISOString(),
      },
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取规划方案详情
   */
  async getPlanById(planId: string): Promise<any | null> {
    let plan: any = null;

    try {
      plan = await this.prisma.planningPlan.findUnique({
        where: { id: planId },
        include: {
          Trip: {
            include: {
              TripCollaborator: {
                select: {
                  userId: true,
                  role: true,
                },
              },
            },
          },
        },
      });
    } catch (error: any) {
      // 如果表不存在，返回 null
      if (error.message?.includes('does not exist') || error.message?.includes('planning_plans')) {
        this.logger.warn('planning_plans 表不存在。请运行数据库迁移创建表。');
        return null;
      }
      throw error;
    }

    if (!plan) {
      return null;
    }

    return {
      id: plan.id,
      tripId: plan.tripId,
      planVersion: plan.planVersion,
      status: plan.status,
      planState: plan.planState,
      uiOutput: plan.uiOutput || {},
      summary: plan.summary || {},
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      createdBy: plan.createdBy,
      trip: {
        id: plan.Trip.id,
        destination: plan.Trip.destination,
        startDate: plan.Trip.startDate.toISOString(),
        endDate: plan.Trip.endDate.toISOString(),
        status: plan.Trip.status,
        collaborators: plan.Trip.TripCollaborator,
      },
    };
  }
}
