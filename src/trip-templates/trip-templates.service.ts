// src/trip-templates/trip-templates.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetTripTemplatesQueryDto, TripTemplateResponseDto, CreateTripFromTemplateDto } from './dto/trip-template.dto';
import { TripsService } from '../trips/trips.service';
import { CreateTripDto } from '../trips/dto/create-trip.dto';

@Injectable()
export class TripTemplatesService {
  constructor(
    private prisma: PrismaService,
    private tripsService: TripsService
  ) {}

  /**
   * 获取行程模板列表
   */
  async findAll(query: GetTripTemplatesQueryDto): Promise<TripTemplateResponseDto[]> {
    const where: any = {};
    
    if (query.theme) {
      where.theme = query.theme;
    }
    
    if (query.destination) {
      where.destination = query.destination;
    }
    
    if (query.isPublic !== undefined) {
      where.isPublic = query.isPublic;
    } else {
      where.isPublic = true; // 默认只返回公开模板
    }

    const templates = await this.prisma.tripTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return templates.map(t => ({
      id: t.id,
      name: t.name,
      nameCN: t.nameCN || undefined,
      description: t.description || undefined,
      theme: t.theme,
      destination: t.destination || undefined,
      config: t.config as Record<string, any>,
      isPublic: t.isPublic,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /**
   * 获取单个行程模板详情
   */
  async findOne(id: string): Promise<TripTemplateResponseDto> {
    const template = await this.prisma.tripTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`行程模板不存在: ${id}`);
    }

    return {
      id: template.id,
      name: template.name,
      nameCN: template.nameCN || undefined,
      description: template.description || undefined,
      theme: template.theme,
      destination: template.destination || undefined,
      config: template.config as Record<string, any>,
      isPublic: template.isPublic,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * 基于模板创建行程
   */
  async createTripFromTemplate(dto: CreateTripFromTemplateDto) {
    // 获取模板
    const template = await this.findOne(dto.templateId);
    
    // 合并模板配置和用户提供的配置
    const config = template.config as any;
    const budgetConfig = dto.overrideConfig?.budgetConfig || config.budgetConfig || {};
    const pacingConfig = dto.overrideConfig?.pacingConfig || config.pacingConfig || {};
    
    // 如果用户提供了总预算，覆盖模板的预算配置
    if (dto.totalBudget) {
      budgetConfig.totalBudget = dto.totalBudget;
    }

    // 构建创建行程的 DTO
    const createTripDto: CreateTripDto = {
      destination: dto.destination,
      startDate: dto.startDate,
      endDate: dto.endDate,
      totalBudget: dto.totalBudget || config.budgetConfig?.totalBudget || 20000,
      travelers: config.travelers || [],
    };

    // 调用 TripsService 创建行程
    return await this.tripsService.create(createTripDto);
  }
}
