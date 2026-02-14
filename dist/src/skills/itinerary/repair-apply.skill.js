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
var RepairApplySkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairApplySkill = void 0;
const common_1 = require("@nestjs/common");
const skill_decorator_1 = require("../decorators/skill.decorator");
const luxon_1 = require("luxon");
let RepairApplySkill = RepairApplySkill_1 = class RepairApplySkill {
    constructor() {
        this.logger = new common_1.Logger(RepairApplySkill_1.name);
        this.metadata = {
            name: 'repair.apply',
            description: '应用修复方案到行程',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['itinerary', 'adjustments'],
                typeChecks: {
                    adjustments: {
                        type: 'array',
                        minLength: 1,
                    },
                },
                extractors: {
                    itinerary: {
                        type: 'step',
                        stepId: 'itinerary.generate',
                        path: 'result.itinerary',
                    },
                    adjustments: {
                        type: 'step',
                        stepId: 'itinerary.verify',
                        path: 'result.issues',
                    },
                },
            },
        };
        this.logger.log(`[RepairApplySkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 repair.apply: request_id=${input.itinerary.request_id}, adjustments=${input.adjustments.length}`);
        try {
            const { itinerary, adjustments, alternatives } = input;
            const repairedItinerary = {
                ...itinerary,
                days: itinerary.days.map(day => ({
                    ...day,
                    items: day.items.map(item => ({ ...item })),
                })),
            };
            const appliedFixes = [];
            const sortedAdjustments = [...adjustments].sort((a, b) => {
                const priorityOrder = {
                    'REPLACE_POI': 1,
                    'REPLACE_SEGMENT': 2,
                    'CHANGE_TRANSPORT': 3,
                    'ADD_BUFFER': 4,
                    'SHORTEN_DAY': 5,
                    'CHANGE_MODE': 6,
                    'CHANGE_DATES': 7,
                };
                return (priorityOrder[a.action] || 99) - (priorityOrder[b.action] || 99);
            });
            for (const adjustment of sortedAdjustments) {
                try {
                    const fixResult = this.applyAdjustment(repairedItinerary, adjustment, alternatives);
                    if (fixResult.applied) {
                        appliedFixes.push({
                            adjustment_type: adjustment.action,
                            target: adjustment.target,
                            description: fixResult.description,
                        });
                    }
                }
                catch (error) {
                    this.logger.warn(`应用调整 ${adjustment.action} 失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            return {
                repaired: appliedFixes.length > 0,
                itinerary: repairedItinerary,
                applied_fixes: appliedFixes,
            };
        }
        catch (error) {
            this.logger.error(`repair.apply 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    applyAdjustment(itinerary, adjustment, alternatives) {
        switch (adjustment.action) {
            case 'REPLACE_POI':
                return this.replacePoi(itinerary, adjustment, alternatives);
            case 'REPLACE_SEGMENT':
                return this.replaceSegment(itinerary, adjustment, alternatives);
            case 'ADD_BUFFER':
                return this.addBuffer(itinerary, adjustment);
            case 'SHORTEN_DAY':
                return this.shortenDay(itinerary, adjustment);
            case 'CHANGE_TRANSPORT':
                return this.changeTransport(itinerary, adjustment);
            case 'CHANGE_MODE':
                return this.changeMode(itinerary, adjustment);
            case 'CHANGE_DATES':
                return this.changeDates(itinerary, adjustment);
            default:
                this.logger.warn(`未知的调整类型: ${adjustment.action}`);
                return { applied: false, description: `未知的调整类型: ${adjustment.action}` };
        }
    }
    replacePoi(itinerary, adjustment, alternatives) {
        var _a, _b;
        if (!adjustment.target) {
            return { applied: false, description: '缺少目标 POI ID' };
        }
        const alternativePoi = (_a = alternatives === null || alternatives === void 0 ? void 0 : alternatives.alternative_pois) === null || _a === void 0 ? void 0 : _a.find(poi => { var _a; return poi.poi_id === adjustment.target || poi.poi_id === ((_a = adjustment.alternatives) === null || _a === void 0 ? void 0 : _a[0]); });
        if (!alternativePoi && adjustment.alternatives && adjustment.alternatives.length > 0) {
            const firstAlternative = adjustment.alternatives[0];
            const foundPoi = (_b = alternatives === null || alternatives === void 0 ? void 0 : alternatives.alternative_pois) === null || _b === void 0 ? void 0 : _b.find(poi => poi.poi_id === firstAlternative);
            if (foundPoi) {
                return this.doReplacePoi(itinerary, adjustment.target, foundPoi);
            }
        }
        if (alternativePoi) {
            return this.doReplacePoi(itinerary, adjustment.target, alternativePoi);
        }
        return { applied: false, description: `未找到替代 POI 用于替换 ${adjustment.target}` };
    }
    doReplacePoi(itinerary, targetPoiId, replacementPoi) {
        var _a;
        let replaced = false;
        for (const day of itinerary.days) {
            for (const item of day.items) {
                if (((_a = item.location_ref) === null || _a === void 0 ? void 0 : _a.place_id) === targetPoiId) {
                    item.location_ref.place_id = replacementPoi.poi_id;
                    item.location_ref.name = replacementPoi.name;
                    if (replacementPoi.evidence_refs) {
                        item.evidence_refs = [...item.evidence_refs, ...replacementPoi.evidence_refs];
                    }
                    item.verified = false;
                    item.verification_status = 'UNVERIFIED';
                    replaced = true;
                }
            }
        }
        if (replaced) {
            return {
                applied: true,
                description: `已将 POI ${targetPoiId} 替换为 ${replacementPoi.name} (${replacementPoi.poi_id})`,
            };
        }
        return { applied: false, description: `未找到目标 POI ${targetPoiId}` };
    }
    replaceSegment(itinerary, adjustment, alternatives) {
        if ((alternatives === null || alternatives === void 0 ? void 0 : alternatives.alternative_routes) && alternatives.alternative_routes.length > 0) {
            return {
                applied: true,
                description: `已标记需要替换路段 ${adjustment.target}，建议使用替代路线`,
            };
        }
        return { applied: false, description: '未找到替代路线' };
    }
    addBuffer(itinerary, adjustment) {
        var _a;
        const BUFFER_MINUTES = 30;
        for (const day of itinerary.days) {
            const items = day.items.filter(item => item.type !== 'REST');
            for (let i = 0; i < items.length - 1; i++) {
                const currentItem = items[i];
                const nextItem = items[i + 1];
                if (currentItem.type === 'TRANSIT' || nextItem.type === 'TRANSIT') {
                    const currentEnd = this.parseTimeWindow(currentItem.end_window, luxon_1.DateTime.fromISO(day.date));
                    const nextStart = this.parseTimeWindow(nextItem.start_window, luxon_1.DateTime.fromISO(day.date));
                    if (currentEnd && nextStart) {
                        const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
                        if (bufferMinutes < BUFFER_MINUTES) {
                            const newStart = currentEnd.plus({ minutes: BUFFER_MINUTES });
                            nextItem.start_window = newStart.toFormat('HH:mm');
                            if (nextItem.end_window) {
                                const nextEnd = this.parseTimeWindow(nextItem.end_window, luxon_1.DateTime.fromISO(day.date));
                                if (nextEnd) {
                                    const duration = nextEnd.diff(nextStart, 'minutes').minutes;
                                    const newEnd = newStart.plus({ minutes: duration });
                                    nextItem.end_window = newEnd.toFormat('HH:mm');
                                }
                            }
                            return {
                                applied: true,
                                description: `已在 ${((_a = nextItem.location_ref) === null || _a === void 0 ? void 0 : _a.name) || '下一站'} 前添加 ${BUFFER_MINUTES} 分钟缓冲时间`,
                            };
                        }
                    }
                }
            }
        }
        return { applied: false, description: '未找到需要添加缓冲的位置' };
    }
    shortenDay(itinerary, adjustment) {
        const targetDay = itinerary.days.find(day => day.date === adjustment.target || day.items.some(item => item.id === adjustment.target));
        if (!targetDay) {
            return { applied: false, description: `未找到目标日期或行程项 ${adjustment.target}` };
        }
        const itemsToRemove = Math.min(2, Math.floor(targetDay.items.length / 3));
        if (itemsToRemove > 0) {
            targetDay.items = targetDay.items.slice(0, -itemsToRemove);
            return {
                applied: true,
                description: `已缩短 ${targetDay.date} 的行程，移除了 ${itemsToRemove} 个行程项`,
            };
        }
        return { applied: false, description: '无法进一步缩短行程' };
    }
    changeTransport(itinerary, adjustment) {
        let changed = false;
        for (const day of itinerary.days) {
            for (const item of day.items) {
                if (item.type === 'TRANSIT' && (!adjustment.target || item.id === adjustment.target)) {
                    item.metadata = item.metadata || {};
                    item.metadata.transport_mode_changed = true;
                    item.notes = (item.notes || '') + ' [交通方式已更改]';
                    changed = true;
                }
            }
        }
        if (changed) {
            return { applied: true, description: '已标记需要更改交通方式' };
        }
        return { applied: false, description: '未找到需要更改的交通项' };
    }
    changeMode(itinerary, adjustment) {
        return {
            applied: true,
            description: `已记录需要更改模式：${adjustment.why}`,
        };
    }
    changeDates(itinerary, adjustment) {
        return {
            applied: true,
            description: `已记录需要更改日期：${adjustment.why}`,
        };
    }
    parseTimeWindow(timeWindow, baseDate) {
        if (!timeWindow) {
            return null;
        }
        if (timeWindow.includes('T') || timeWindow.includes('Z')) {
            try {
                return luxon_1.DateTime.fromISO(timeWindow);
            }
            catch {
                return null;
            }
        }
        const timeMatch = timeWindow.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            return baseDate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        }
        return null;
    }
};
exports.RepairApplySkill = RepairApplySkill;
exports.RepairApplySkill = RepairApplySkill = RepairApplySkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'repair.apply',
        description: '应用修复方案到行程',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RepairApplySkill);
//# sourceMappingURL=repair-apply.skill.js.map