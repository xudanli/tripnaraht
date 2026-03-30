// src/trips/readiness/services/packing-template.service.ts

/**
 * 打包清单模板服务
 * 基于 packing-checklist-template.json 和 packing-guide.json 生成个性化打包清单
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PackingChecklistTemplate,
  PackingGuide,
  PackingListContext,
  EnhancedPackingListItem,
  Season,
  QuickChecklistTemplate,
} from '../types/packing-template.types';
import { DateTime } from 'luxon';

@Injectable()
export class PackingTemplateService {
  private readonly logger = new Logger(PackingTemplateService.name);
  private templateData: PackingChecklistTemplate | null = null;
  private guideData: PackingGuide | null = null;

  constructor() {
    // 延迟加载，避免启动时文件不存在导致错误
    try {
      this.loadTemplateData();
    } catch (error: any) {
      this.logger.warn(`模板数据加载失败，将在首次使用时重试: ${error.message}`);
    }
  }

  /**
   * 加载模板数据
   */
  private loadTemplateData() {
    try {
      const templatePath = join(process.cwd(), 'data', 'packing-checklist-template.json');
      const guidePath = join(process.cwd(), 'data', 'packing-guide.json');

      const templateContent = readFileSync(templatePath, 'utf-8');
      const guideContent = readFileSync(guidePath, 'utf-8');

      this.templateData = JSON.parse(templateContent) as PackingChecklistTemplate;
      this.guideData = JSON.parse(guideContent) as PackingGuide;

      this.logger.log('打包清单模板数据加载成功');
    } catch (error: any) {
      this.logger.error(`加载打包清单模板数据失败: ${error.message}`);
    }
  }

  /**
   * 根据上下文生成打包清单
   */
  generatePackingList(context: PackingListContext): EnhancedPackingListItem[] {
    // 如果数据未加载，尝试重新加载
    if (!this.templateData || !this.guideData) {
      this.loadTemplateData();
    }

    if (!this.templateData || !this.guideData) {
      this.logger.warn('模板数据未加载，返回空列表');
      return [];
    }

    const items: EnhancedPackingListItem[] = [];

    // 1. 根据季节获取快速清单
    const quickChecklist = this.getQuickChecklist(context.season);
    if (quickChecklist) {
      items.push(...this.parseQuickChecklistItems(quickChecklist, context));
    }

    // 2. 根据用户类型添加特定物品
    if (context.userType) {
      const userTypeItems = this.getUserTypeItems(context.userType, context);
      items.push(...userTypeItems);
    }

    // 3. 根据活动添加特定物品
    if (context.activities && context.activities.length > 0) {
      const activityItems = this.getActivityItems(context.activities, context);
      items.push(...activityItems);
    }

    // 4. 根据天数调整数量
    this.adjustQuantitiesByDuration(items, context.durationDays, context.season);

    // 5. 去重和合并
    return this.deduplicateAndMerge(items);
  }

  /**
   * 获取快速清单模板
   */
  private getQuickChecklist(season: Season): QuickChecklistTemplate | null {
    if (!this.templateData) return null;

    switch (season) {
      case 'summer':
        return this.templateData.quick_checklist_summer;
      case 'transition':
        return this.templateData.quick_checklist_transition;
      case 'winter':
        return this.templateData.quick_checklist_winter;
      default:
        return null;
    }
  }

  /**
   * 解析快速清单项
   */
  private parseQuickChecklistItems(
    checklist: QuickChecklistTemplate,
    _context: PackingListContext
  ): EnhancedPackingListItem[] {
    const items: EnhancedPackingListItem[] = [];

    for (const itemStr of checklist.items) {
      // 解析格式：✅ 物品名称 或 ✅ 物品名称x数量
      const item = this.parseItemString(itemStr, 'must');
      if (item) {
        items.push(item);
      }
    }

    // 处理 whatToSkip（标记为 optional 或排除）
    if (checklist.whatToSkip) {
      for (const skipStr of checklist.whatToSkip) {
        // 格式：❌ 物品名称
        const itemName = skipStr.replace('❌', '').trim();
        // 从列表中移除或标记为 optional
        const index = items.findIndex(i => i.name.includes(itemName));
        if (index >= 0) {
          items[index].priority = 'optional';
        }
      }
    }

    return items;
  }

  /**
   * 解析物品字符串
   */
  private parseItemString(itemStr: string, defaultPriority: 'must' | 'should' | 'optional'): EnhancedPackingListItem | null {
    // 移除标记符号
    const cleanStr = itemStr.replace(/^[✅❌☐]\s*/, '').trim();
    if (!cleanStr) return null;

    // 提取数量（格式：物品名称x数量 或 物品名称(数量)）
    let name = cleanStr;
    let quantity = 1;
    let unit: string | undefined;

    // 匹配 x数量 格式
    const xMatch = cleanStr.match(/x(\d+)/i);
    if (xMatch) {
      quantity = parseInt(xMatch[1], 10);
      name = cleanStr.replace(/x\d+/i, '').trim();
    }

    // 匹配 (数量) 格式
    const parenMatch = cleanStr.match(/\((\d+)\)/);
    if (parenMatch) {
      quantity = parseInt(parenMatch[1], 10);
      name = cleanStr.replace(/\(\d+\)/, '').trim();
    }

    // 匹配单位（如：3套、2双、1件）
    const unitMatch = name.match(/(\d+)(套|双|件|个|条|支|瓶|片)/);
    if (unitMatch) {
      quantity = parseInt(unitMatch[1], 10);
      unit = unitMatch[2];
      name = name.replace(/\d+[套双件个条支瓶片]/, '').trim();
    }

    // 确定类别
    const category = this.inferCategory(name);

    return {
      id: `item-${Date.now()}-${Math.random()}`,
      name,
      category,
      quantity,
      unit,
      priority: defaultPriority,
      checked: false,
    };
  }

  /**
   * 推断物品类别
   */
  private inferCategory(name: string): EnhancedPackingListItem['category'] {
    const lowerName = name.toLowerCase();

    // 衣物类
    if (
      lowerName.includes('衣') ||
      lowerName.includes('裤') ||
      lowerName.includes('袜') ||
      lowerName.includes('帽') ||
      lowerName.includes('手套') ||
      lowerName.includes('围巾') ||
      lowerName.includes('clothing') ||
      lowerName.includes('jacket') ||
      lowerName.includes('pants') ||
      lowerName.includes('sock')
    ) {
      return 'clothing';
    }

    // 装备类
    if (
      lowerName.includes('背包') ||
      lowerName.includes('靴') ||
      lowerName.includes('冰爪') ||
      lowerName.includes('头灯') ||
      lowerName.includes('pack') ||
      lowerName.includes('boot') ||
      lowerName.includes('gear')
    ) {
      return 'gear';
    }

    // 证件类
    if (
      lowerName.includes('护照') ||
      lowerName.includes('驾照') ||
      lowerName.includes('保险') ||
      lowerName.includes('passport') ||
      lowerName.includes('license') ||
      lowerName.includes('insurance')
    ) {
      return 'documents';
    }

    // 电子类
    if (
      lowerName.includes('手机') ||
      lowerName.includes('充电') ||
      lowerName.includes('相机') ||
      lowerName.includes('phone') ||
      lowerName.includes('camera') ||
      lowerName.includes('battery')
    ) {
      return 'electronics';
    }

    // 医疗类
    if (
      lowerName.includes('急救') ||
      lowerName.includes('药') ||
      lowerName.includes('first') ||
      lowerName.includes('medical')
    ) {
      return 'medical';
    }

    // 食物类
    if (
      lowerName.includes('零食') ||
      lowerName.includes('能量') ||
      lowerName.includes('snack') ||
      lowerName.includes('food')
    ) {
      return 'food';
    }

    return 'other';
  }

  /**
   * 获取用户类型特定物品
   */
  private getUserTypeItems(userType: string, context: PackingListContext): EnhancedPackingListItem[] {
    if (!this.templateData || !this.templateData.template_by_user_type) return [];

    // 尝试多种键格式
    const possibleKeys = [
      `${userType}_${context.season}_${context.durationDays}days`,
      `${userType}_${context.season}`,
      userType,
    ];

    let template: any = null;
    for (const key of possibleKeys) {
      if (this.templateData.template_by_user_type[key]) {
        template = this.templateData.template_by_user_type[key];
        break;
      }
    }

    if (!template) return [];

    if (!template) return [];

    const items: EnhancedPackingListItem[] = [];

    // 核心清单
    if (template.core_list) {
      for (const itemStr of template.core_list) {
        const item = this.parseItemString(itemStr, 'must');
        if (item) items.push(item);
      }
    }

    // 摄影师特定物品
    if (userType === 'photographer' && template.photography_items) {
      for (const itemStr of template.photography_items) {
        const item = this.parseItemString(itemStr, 'should');
        if (item) {
          item.category = 'electronics';
          items.push(item);
        }
      }
    }

    // 家庭特定物品
    if (userType === 'family_with_kids' && template.kid_specific) {
      for (const itemStr of template.kid_specific) {
        const item = this.parseItemString(itemStr, 'should');
        if (item) items.push(item);
      }
    }

    return items;
  }

  /**
   * 获取活动特定物品
   */
  private getActivityItems(activities: string[], _context: PackingListContext): EnhancedPackingListItem[] {
    const items: EnhancedPackingListItem[] = [];

    for (const activity of activities) {
      switch (activity) {
        case 'glacier_trekking':
        case 'ice_caving':
          items.push({
            id: `activity-${activity}-crampons`,
            name: '冰爪',
            nameCN: '冰爪',
            category: 'gear',
            quantity: 1,
            priority: 'must',
            checked: false,
            reason: '冰川徒步和冰洞探索必需',
          });
          break;
        case 'photography':
          items.push({
            id: `activity-${activity}-tripod`,
            name: '三脚架',
            nameCN: '三脚架',
            category: 'electronics',
            quantity: 1,
            priority: 'should',
            checked: false,
            reason: '风光摄影必需',
          });
          break;
        case 'camping':
          items.push({
            id: `activity-${activity}-headlamp`,
            name: '头灯',
            nameCN: '头灯',
            category: 'gear',
            quantity: 1,
            priority: 'must',
            checked: false,
            reason: '露营必需',
          });
          break;
      }
    }

    return items;
  }

  /**
   * 根据天数调整数量
   */
  private adjustQuantitiesByDuration(
    items: EnhancedPackingListItem[],
    durationDays: number,
    season: Season
  ) {
    if (!this.templateData) return;

    const guide = this.templateData.seasonal_quantity_guide;
    if (!guide || !guide.baseLayersNeeded) return;

    const durationKey = this.getDurationKey(durationDays);
    const seasonGuide = guide.baseLayersNeeded[season];
    
    if (!seasonGuide || !seasonGuide[durationKey]) return;

    // 调整基础层数量
    // 例如："上衣2件，裤子2件，袜子3双"
    // 这里简化处理，实际可以更精确地解析和更新
    // 目前主要依赖模板数据中的数量，这里可以进一步优化
  }

  /**
   * 获取天数键
   */
  private getDurationKey(days: number): string {
    if (days <= 3) return '1_3_days';
    if (days <= 7) return '4_7_days';
    return '8_14_days';
  }

  /**
   * 去重和合并
   */
  private deduplicateAndMerge(items: EnhancedPackingListItem[]): EnhancedPackingListItem[] {
    const itemMap = new Map<string, EnhancedPackingListItem>();

    for (const item of items) {
      const key = item.name.toLowerCase();
      const existing = itemMap.get(key);

      if (existing) {
        // 合并：取更高的优先级，累加数量
        existing.quantity = Math.max(existing.quantity, item.quantity);
        if (item.priority === 'must' && existing.priority !== 'must') {
          existing.priority = 'must';
        } else if (item.priority === 'should' && existing.priority === 'optional') {
          existing.priority = 'should';
        }
        // 合并备注
        if (item.note && !existing.note) {
          existing.note = item.note;
        }
      } else {
        itemMap.set(key, { ...item });
      }
    }

    return Array.from(itemMap.values());
  }

  /**
   * 从日期推断季节
   */
  inferSeasonFromDate(date: Date): Season {
    const month = DateTime.fromJSDate(date).month;

    // 夏季: 6-8月
    if (month >= 6 && month <= 8) {
      return 'summer';
    }

    // 过渡季: 5月, 9月
    if (month === 5 || month === 9) {
      return 'transition';
    }

    // 冬季: 11-3月
    if (month >= 11 || month <= 3) {
      return 'winter';
    }

    // 默认过渡季
    return 'transition';
  }

  /**
   * 获取打包顺序步骤
   */
  getPackingOrderSteps(): any {
    // 如果数据未加载，尝试重新加载
    if (!this.templateData) {
      this.loadTemplateData();
    }
    
    if (!this.templateData) {
      this.logger.warn('模板数据未加载，返回空数组');
      return { description: '模板数据未加载', steps: [] };
    }
    
    return this.templateData.packing_order_steps || { description: '', steps: [] };
  }

  /**
   * 获取出发前检查清单
   */
  getPreDepartureChecklist(): any {
    // 如果数据未加载，尝试重新加载
    if (!this.templateData) {
      this.loadTemplateData();
    }
    
    if (!this.templateData) {
      this.logger.warn('模板数据未加载，返回空对象');
      return {
        description: '模板数据未加载',
        '1_day_before': [],
        '3_hours_before': [],
        '30_minutes_before': [],
        critical_items_absolute_must_have: [],
      };
    }
    
    return this.templateData.pre_departure_final_checklist || {
      description: '',
      '1_day_before': [],
      '3_hours_before': [],
      '30_minutes_before': [],
      critical_items_absolute_must_have: [],
    };
  }
}
