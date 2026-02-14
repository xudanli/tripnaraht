"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PackingTemplateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackingTemplateService = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
const luxon_1 = require("luxon");
let PackingTemplateService = PackingTemplateService_1 = class PackingTemplateService {
    constructor() {
        this.logger = new common_1.Logger(PackingTemplateService_1.name);
        this.templateData = null;
        this.guideData = null;
        try {
            this.loadTemplateData();
        }
        catch (error) {
            this.logger.warn(`模板数据加载失败，将在首次使用时重试: ${error.message}`);
        }
    }
    loadTemplateData() {
        try {
            const templatePath = (0, path_1.join)(process.cwd(), 'data', 'packing-checklist-template.json');
            const guidePath = (0, path_1.join)(process.cwd(), 'data', 'packing-guide.json');
            const templateContent = (0, fs_1.readFileSync)(templatePath, 'utf-8');
            const guideContent = (0, fs_1.readFileSync)(guidePath, 'utf-8');
            this.templateData = JSON.parse(templateContent);
            this.guideData = JSON.parse(guideContent);
            this.logger.log('打包清单模板数据加载成功');
        }
        catch (error) {
            this.logger.error(`加载打包清单模板数据失败: ${error.message}`);
        }
    }
    generatePackingList(context) {
        if (!this.templateData || !this.guideData) {
            this.loadTemplateData();
        }
        if (!this.templateData || !this.guideData) {
            this.logger.warn('模板数据未加载，返回空列表');
            return [];
        }
        const items = [];
        const quickChecklist = this.getQuickChecklist(context.season);
        if (quickChecklist) {
            items.push(...this.parseQuickChecklistItems(quickChecklist, context));
        }
        if (context.userType) {
            const userTypeItems = this.getUserTypeItems(context.userType, context);
            items.push(...userTypeItems);
        }
        if (context.activities && context.activities.length > 0) {
            const activityItems = this.getActivityItems(context.activities, context);
            items.push(...activityItems);
        }
        this.adjustQuantitiesByDuration(items, context.durationDays, context.season);
        return this.deduplicateAndMerge(items);
    }
    getQuickChecklist(season) {
        if (!this.templateData)
            return null;
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
    parseQuickChecklistItems(checklist, context) {
        const items = [];
        for (const itemStr of checklist.items) {
            const item = this.parseItemString(itemStr, 'must');
            if (item) {
                items.push(item);
            }
        }
        if (checklist.whatToSkip) {
            for (const skipStr of checklist.whatToSkip) {
                const itemName = skipStr.replace('❌', '').trim();
                const index = items.findIndex(i => i.name.includes(itemName));
                if (index >= 0) {
                    items[index].priority = 'optional';
                }
            }
        }
        return items;
    }
    parseItemString(itemStr, defaultPriority) {
        let cleanStr = itemStr.replace(/^[✅❌☐]\s*/, '').trim();
        if (!cleanStr)
            return null;
        let name = cleanStr;
        let quantity = 1;
        let unit;
        const xMatch = cleanStr.match(/x(\d+)/i);
        if (xMatch) {
            quantity = parseInt(xMatch[1], 10);
            name = cleanStr.replace(/x\d+/i, '').trim();
        }
        const parenMatch = cleanStr.match(/\((\d+)\)/);
        if (parenMatch) {
            quantity = parseInt(parenMatch[1], 10);
            name = cleanStr.replace(/\(\d+\)/, '').trim();
        }
        const unitMatch = name.match(/(\d+)(套|双|件|个|条|支|瓶|片)/);
        if (unitMatch) {
            quantity = parseInt(unitMatch[1], 10);
            unit = unitMatch[2];
            name = name.replace(/\d+[套双件个条支瓶片]/, '').trim();
        }
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
    inferCategory(name) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('衣') ||
            lowerName.includes('裤') ||
            lowerName.includes('袜') ||
            lowerName.includes('帽') ||
            lowerName.includes('手套') ||
            lowerName.includes('围巾') ||
            lowerName.includes('clothing') ||
            lowerName.includes('jacket') ||
            lowerName.includes('pants') ||
            lowerName.includes('sock')) {
            return 'clothing';
        }
        if (lowerName.includes('背包') ||
            lowerName.includes('靴') ||
            lowerName.includes('冰爪') ||
            lowerName.includes('头灯') ||
            lowerName.includes('pack') ||
            lowerName.includes('boot') ||
            lowerName.includes('gear')) {
            return 'gear';
        }
        if (lowerName.includes('护照') ||
            lowerName.includes('驾照') ||
            lowerName.includes('保险') ||
            lowerName.includes('passport') ||
            lowerName.includes('license') ||
            lowerName.includes('insurance')) {
            return 'documents';
        }
        if (lowerName.includes('手机') ||
            lowerName.includes('充电') ||
            lowerName.includes('相机') ||
            lowerName.includes('phone') ||
            lowerName.includes('camera') ||
            lowerName.includes('battery')) {
            return 'electronics';
        }
        if (lowerName.includes('急救') ||
            lowerName.includes('药') ||
            lowerName.includes('first') ||
            lowerName.includes('medical')) {
            return 'medical';
        }
        if (lowerName.includes('零食') ||
            lowerName.includes('能量') ||
            lowerName.includes('snack') ||
            lowerName.includes('food')) {
            return 'food';
        }
        return 'other';
    }
    getUserTypeItems(userType, context) {
        if (!this.templateData || !this.templateData.template_by_user_type)
            return [];
        const possibleKeys = [
            `${userType}_${context.season}_${context.durationDays}days`,
            `${userType}_${context.season}`,
            userType,
        ];
        let template = null;
        for (const key of possibleKeys) {
            if (this.templateData.template_by_user_type[key]) {
                template = this.templateData.template_by_user_type[key];
                break;
            }
        }
        if (!template)
            return [];
        if (!template)
            return [];
        const items = [];
        if (template.core_list) {
            for (const itemStr of template.core_list) {
                const item = this.parseItemString(itemStr, 'must');
                if (item)
                    items.push(item);
            }
        }
        if (userType === 'photographer' && template.photography_items) {
            for (const itemStr of template.photography_items) {
                const item = this.parseItemString(itemStr, 'should');
                if (item) {
                    item.category = 'electronics';
                    items.push(item);
                }
            }
        }
        if (userType === 'family_with_kids' && template.kid_specific) {
            for (const itemStr of template.kid_specific) {
                const item = this.parseItemString(itemStr, 'should');
                if (item)
                    items.push(item);
            }
        }
        return items;
    }
    getActivityItems(activities, context) {
        const items = [];
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
    adjustQuantitiesByDuration(items, durationDays, season) {
        if (!this.templateData)
            return;
        const guide = this.templateData.seasonal_quantity_guide;
        if (!guide || !guide.baseLayersNeeded)
            return;
        const durationKey = this.getDurationKey(durationDays);
        const seasonGuide = guide.baseLayersNeeded[season];
        if (!seasonGuide || !seasonGuide[durationKey])
            return;
    }
    getDurationKey(days) {
        if (days <= 3)
            return '1_3_days';
        if (days <= 7)
            return '4_7_days';
        return '8_14_days';
    }
    deduplicateAndMerge(items) {
        const itemMap = new Map();
        for (const item of items) {
            const key = item.name.toLowerCase();
            const existing = itemMap.get(key);
            if (existing) {
                existing.quantity = Math.max(existing.quantity, item.quantity);
                if (item.priority === 'must' && existing.priority !== 'must') {
                    existing.priority = 'must';
                }
                else if (item.priority === 'should' && existing.priority === 'optional') {
                    existing.priority = 'should';
                }
                if (item.note && !existing.note) {
                    existing.note = item.note;
                }
            }
            else {
                itemMap.set(key, { ...item });
            }
        }
        return Array.from(itemMap.values());
    }
    inferSeasonFromDate(date) {
        const month = luxon_1.DateTime.fromJSDate(date).month;
        if (month >= 6 && month <= 8) {
            return 'summer';
        }
        if (month === 5 || month === 9) {
            return 'transition';
        }
        if (month >= 11 || month <= 3) {
            return 'winter';
        }
        return 'transition';
    }
    getPackingOrderSteps() {
        if (!this.templateData) {
            this.loadTemplateData();
        }
        if (!this.templateData) {
            this.logger.warn('模板数据未加载，返回空数组');
            return { description: '模板数据未加载', steps: [] };
        }
        return this.templateData.packing_order_steps || { description: '', steps: [] };
    }
    getPreDepartureChecklist() {
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
};
exports.PackingTemplateService = PackingTemplateService;
exports.PackingTemplateService = PackingTemplateService = PackingTemplateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PackingTemplateService);
//# sourceMappingURL=packing-template.service.js.map