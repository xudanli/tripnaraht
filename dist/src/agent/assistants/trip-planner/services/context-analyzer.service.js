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
var ContextAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const intent_uncertainty_interface_1 = require("../interfaces/intent-uncertainty.interface");
let ContextAnalyzerService = ContextAnalyzerService_1 = class ContextAnalyzerService {
    constructor() {
        this.logger = new common_1.Logger(ContextAnalyzerService_1.name);
        this.config = intent_uncertainty_interface_1.DEFAULT_GAP_ANALYSIS_CONFIG;
    }
    detectGaps(tripContext) {
        const gaps = [];
        this.logger.debug(`[缺口检测] 分析 ${tripContext.durationDays} 天行程`);
        for (const day of tripContext.days) {
            if (this.config.detectMealGaps) {
                const mealGaps = this.detectMealGaps(day, tripContext);
                gaps.push(...mealGaps);
            }
            if (this.config.detectActivityGaps) {
                const activityGaps = this.detectActivityGaps(day, tripContext);
                gaps.push(...activityGaps);
            }
            if (this.config.detectTransportGaps) {
                const transportGaps = this.detectTransportGaps(day, tripContext);
                gaps.push(...transportGaps);
            }
        }
        if (this.config.detectHotelGaps) {
            const hotelGaps = this.detectHotelGaps(tripContext);
            gaps.push(...hotelGaps);
        }
        this.logger.debug(`[缺口检测] 发现 ${gaps.length} 个缺口`);
        return gaps;
    }
    detectMealGaps(day, tripContext) {
        const gaps = [];
        for (const window of this.config.mealWindows) {
            const hasMealInWindow = day.items.some(item => item.type === 'RESTAURANT' &&
                this.isTimeInWindow(item.startTime, window.start, window.end));
            if (hasMealInWindow) {
                continue;
            }
            const activitiesInWindow = day.items.filter(item => item.type !== 'RESTAURANT' &&
                this.isTimeOverlapping(item.startTime, item.endTime, window.start, window.end));
            if (activitiesInWindow.length > 0 || day.items.length > 0) {
                const beforeActivity = this.findActivityBefore(day.items, window.start);
                const afterActivity = this.findActivityAfter(day.items, window.end);
                const existingMealCount = day.items.filter(i => i.type === 'RESTAURANT').length;
                gaps.push({
                    id: `gap_meal_${day.dayNumber}_${window.name}`,
                    type: 'MEAL',
                    dayNumber: day.dayNumber,
                    date: day.date,
                    timeSlot: { start: window.start, end: window.end },
                    severity: window.required ? 'CRITICAL' : 'SUGGESTED',
                    description: `第${day.dayNumber}天${window.name}未安排（${window.start}-${window.end}）`,
                    context: {
                        beforeActivity: beforeActivity ? {
                            name: beforeActivity.name,
                            endTime: beforeActivity.endTime || '',
                        } : undefined,
                        afterActivity: afterActivity ? {
                            name: afterActivity.name,
                            startTime: afterActivity.startTime || '',
                        } : undefined,
                        dayTheme: day.theme,
                        dayCity: day.city,
                        existingCount: existingMealCount,
                    },
                    suggestions: this.generateMealSuggestions(day, window, tripContext),
                });
            }
        }
        return gaps;
    }
    detectActivityGaps(day, tripContext) {
        const gaps = [];
        const sortedItems = [...day.items]
            .filter(item => item.startTime)
            .sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime));
        if (sortedItems.length < 2) {
            return gaps;
        }
        for (let i = 0; i < sortedItems.length - 1; i++) {
            const current = sortedItems[i];
            const next = sortedItems[i + 1];
            const currentEndMinutes = this.timeToMinutes(current.endTime || current.startTime) +
                (current.duration || 60);
            const nextStartMinutes = this.timeToMinutes(next.startTime);
            const gapMinutes = nextStartMinutes - currentEndMinutes;
            const gapStart = this.minutesToTime(currentEndMinutes);
            const gapEnd = this.minutesToTime(nextStartMinutes);
            const isMealTime = this.config.mealWindows.some(w => this.isTimeOverlapping(gapStart, gapEnd, w.start, w.end));
            if (gapMinutes >= this.config.minFreeTimeForGap && !isMealTime) {
                gaps.push({
                    id: `gap_activity_${day.dayNumber}_${i}`,
                    type: 'FREE_TIME',
                    dayNumber: day.dayNumber,
                    date: day.date,
                    timeSlot: { start: gapStart, end: gapEnd },
                    severity: 'OPTIONAL',
                    description: `第${day.dayNumber}天${gapStart}-${gapEnd}有${Math.round(gapMinutes / 60)}小时空闲`,
                    context: {
                        beforeActivity: { name: current.name, endTime: current.endTime || '' },
                        afterActivity: { name: next.name, startTime: next.startTime || '' },
                        dayTheme: day.theme,
                        dayCity: day.city,
                        existingCount: day.items.filter(i => i.type === 'POI' || i.type === 'ACTIVITY').length,
                    },
                    suggestions: [`可以安排一个${day.city || tripContext.destinationName}的景点`],
                });
            }
        }
        return gaps;
    }
    detectTransportGaps(day, tripContext) {
        const gaps = [];
        const poiItems = day.items
            .filter(item => ['POI', 'ACTIVITY', 'RESTAURANT'].includes(item.type) && item.startTime)
            .sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime));
        if (poiItems.length < 2) {
            return gaps;
        }
        for (let i = 0; i < poiItems.length - 1; i++) {
            const current = poiItems[i];
            const next = poiItems[i + 1];
            const hasTransport = day.items.some(item => item.type === 'TRANSPORT' &&
                item.from === current.name &&
                item.to === next.name);
            if (!hasTransport && current.address !== next.address) {
                const transportStart = current.endTime ||
                    this.minutesToTime(this.timeToMinutes(current.startTime) + (current.duration || 60));
                const transportEnd = next.startTime;
                gaps.push({
                    id: `gap_transport_${day.dayNumber}_${i}`,
                    type: 'TRANSPORT',
                    dayNumber: day.dayNumber,
                    date: day.date,
                    timeSlot: { start: transportStart, end: transportEnd },
                    severity: 'SUGGESTED',
                    description: `${current.name} → ${next.name} 未安排交通`,
                    context: {
                        beforeActivity: { name: current.name, endTime: transportStart },
                        afterActivity: { name: next.name, startTime: transportEnd },
                        dayTheme: day.theme,
                        dayCity: day.city,
                        existingCount: day.items.filter(i => i.type === 'TRANSPORT').length,
                    },
                    suggestions: ['可以查询公共交通或打车方案'],
                });
            }
        }
        return gaps;
    }
    detectHotelGaps(tripContext) {
        const gaps = [];
        for (let i = 0; i < tripContext.days.length - 1; i++) {
            const day = tripContext.days[i];
            const hasHotel = day.items.some(item => item.type === 'HOTEL');
            if (!hasHotel) {
                gaps.push({
                    id: `gap_hotel_${day.dayNumber}`,
                    type: 'HOTEL',
                    dayNumber: day.dayNumber,
                    date: day.date,
                    timeSlot: { start: '21:00', end: '23:59' },
                    severity: 'CRITICAL',
                    description: `第${day.dayNumber}天未安排住宿`,
                    context: {
                        dayTheme: day.theme,
                        dayCity: day.city,
                        existingCount: 0,
                    },
                    suggestions: [`推荐在${day.city || tripContext.destinationName}预订酒店`],
                });
            }
        }
        return gaps;
    }
    analyzeRequestGapRelation(message, intent, gaps) {
        const requestedType = this.extractRequestedType(message);
        if (!requestedType) {
            return {
                related: false,
                matchedGaps: [],
                confidence: 0,
            };
        }
        const matchedGaps = gaps.filter(g => this.isGapTypeMatch(g.type, requestedType));
        if (matchedGaps.length === 0) {
            return {
                related: false,
                matchedGaps: [],
                confidence: 0,
                requestedType,
            };
        }
        const sortedGaps = [...matchedGaps].sort((a, b) => {
            const severityOrder = { CRITICAL: 0, SUGGESTED: 1, OPTIONAL: 2 };
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0)
                return severityDiff;
            return a.dayNumber - b.dayNumber;
        });
        const bestMatch = sortedGaps[0];
        const confidence = bestMatch.severity === 'CRITICAL' ? 0.9 :
            bestMatch.severity === 'SUGGESTED' ? 0.7 : 0.5;
        return {
            related: true,
            matchedGaps: sortedGaps,
            bestMatch,
            confidence,
            requestedType,
        };
    }
    extractRequestedType(message) {
        for (const [keyword, type] of Object.entries(intent_uncertainty_interface_1.KEYWORD_TO_GAP_TYPE)) {
            if (message.includes(keyword)) {
                return type;
            }
        }
        return null;
    }
    isGapTypeMatch(gapType, requestedType) {
        if (gapType === requestedType)
            return true;
        if (gapType === 'FREE_TIME' && requestedType === 'ACTIVITY')
            return true;
        return false;
    }
    generateDaySummary(day) {
        const itemCount = day.items.length;
        const mealCount = day.items.filter(i => i.type === 'RESTAURANT').length;
        const poiCount = day.items.filter(i => i.type === 'POI' || i.type === 'ACTIVITY').length;
        const parts = [];
        if (day.theme) {
            parts.push(`主题：${day.theme}`);
        }
        if (day.city) {
            parts.push(`地点：${day.city}`);
        }
        parts.push(`已安排：${poiCount}个景点、${mealCount}餐`);
        if (day.stats.freeTime > 60) {
            parts.push(`空闲：${Math.round(day.stats.freeTime / 60)}小时`);
        }
        return parts.join('，');
    }
    formatGapDescription(gap, detailed = false) {
        const basic = gap.description;
        if (!detailed) {
            return basic;
        }
        const parts = [basic];
        if (gap.context.beforeActivity) {
            parts.push(`前一活动：${gap.context.beforeActivity.name}`);
        }
        if (gap.context.afterActivity) {
            parts.push(`后一活动：${gap.context.afterActivity.name}`);
        }
        if (gap.suggestions && gap.suggestions.length > 0) {
            parts.push(`建议：${gap.suggestions[0]}`);
        }
        return parts.join('；');
    }
    isTimeInWindow(time, windowStart, windowEnd) {
        if (time === undefined || time === null)
            return false;
        const timeMinutes = this.timeToMinutes(time);
        if (timeMinutes === 0 && time !== 0 && time !== '00:00')
            return false;
        const startMinutes = this.timeToMinutes(windowStart);
        const endMinutes = this.timeToMinutes(windowEnd);
        return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
    }
    isTimeOverlapping(start1, end1, start2, end2) {
        if (start1 === undefined || start1 === null)
            return false;
        const s1 = this.timeToMinutes(start1);
        if (s1 === 0 && start1 !== 0 && start1 !== '00:00')
            return false;
        const e1 = end1 ? this.timeToMinutes(end1) : s1 + 60;
        const s2 = this.timeToMinutes(start2);
        const e2 = this.timeToMinutes(end2);
        return !(e1 <= s2 || s1 >= e2);
    }
    timeToMinutes(time) {
        if (time === undefined || time === null) {
            return 0;
        }
        if (typeof time === 'number') {
            return time;
        }
        if (time instanceof Date) {
            return time.getHours() * 60 + time.getMinutes();
        }
        if (typeof time === 'string') {
            if (time.includes('T')) {
                const date = new Date(time);
                if (!isNaN(date.getTime())) {
                    return date.getHours() * 60 + date.getMinutes();
                }
            }
            if (time.includes(':')) {
                const [hours, minutes] = time.split(':').map(Number);
                return (hours || 0) * 60 + (minutes || 0);
            }
            const num = parseInt(time, 10);
            if (!isNaN(num)) {
                return num;
            }
        }
        this.logger.warn(`[时间解析] 无法解析时间: ${time} (类型: ${typeof time})`);
        return 0;
    }
    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    findActivityBefore(items, time) {
        const timeMinutes = this.timeToMinutes(time);
        return items
            .filter(item => {
            if (!item.startTime)
                return false;
            const endMinutes = item.endTime
                ? this.timeToMinutes(item.endTime)
                : this.timeToMinutes(item.startTime) + (item.duration || 60);
            return endMinutes <= timeMinutes;
        })
            .sort((a, b) => {
            const aEnd = a.endTime ? this.timeToMinutes(a.endTime) : this.timeToMinutes(a.startTime) + (a.duration || 60);
            const bEnd = b.endTime ? this.timeToMinutes(b.endTime) : this.timeToMinutes(b.startTime) + (b.duration || 60);
            return bEnd - aEnd;
        })[0];
    }
    findActivityAfter(items, time) {
        const timeMinutes = this.timeToMinutes(time);
        return items
            .filter(item => item.startTime && this.timeToMinutes(item.startTime) >= timeMinutes)
            .sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime))[0];
    }
    generateMealSuggestions(day, mealWindow, tripContext) {
        const suggestions = [];
        const city = day.city || tripContext.destinationName;
        suggestions.push(`推荐在${city}附近寻找${mealWindow.name}地点`);
        const beforeActivity = this.findActivityBefore(day.items, mealWindow.start);
        if (beforeActivity) {
            suggestions.push(`可以在${beforeActivity.name}附近用餐`);
        }
        return suggestions;
    }
};
exports.ContextAnalyzerService = ContextAnalyzerService;
exports.ContextAnalyzerService = ContextAnalyzerService = ContextAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ContextAnalyzerService);
//# sourceMappingURL=context-analyzer.service.js.map