"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TransportPluginService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportPluginService = void 0;
const common_1 = require("@nestjs/common");
let TransportPluginService = TransportPluginService_1 = class TransportPluginService {
    constructor() {
        this.logger = new common_1.Logger(TransportPluginService_1.name);
    }
    generateChecklist(routeDirection, itineraryDraft, availableModes, userBookingStatus) {
        var _a;
        const rd = routeDirection.routeDirection;
        const extensions = (((_a = rd.metadata) === null || _a === void 0 ? void 0 : _a.extensions) || {});
        const transport = extensions.transport;
        const countryCode = rd.countryCode || '';
        const reminders = [];
        const alternativeStrategies = [];
        const unavailableModes = [];
        if ((transport === null || transport === void 0 ? void 0 : transport.requiredModes) && transport.requiredModes.length > 0) {
            for (const requirement of transport.requiredModes) {
                if (!requirement.required)
                    continue;
                const mode = requirement.mode;
                const isAvailable = availableModes ? availableModes.includes(mode) : true;
                if (!isAvailable) {
                    unavailableModes.push(mode);
                }
                const isBooked = this.checkBookingStatus(mode, userBookingStatus);
                const reminder = this.createBookingReminder(mode, requirement, countryCode, isAvailable, isBooked);
                if (reminder) {
                    reminders.push(reminder);
                    if (!isAvailable || !isBooked) {
                        const strategies = this.generateAlternativeStrategies(mode, requirement, countryCode, itineraryDraft);
                        alternativeStrategies.push(...strategies);
                    }
                }
            }
        }
        if ((transport === null || transport === void 0 ? void 0 : transport.optionalModes) && transport.optionalModes.length > 0) {
            for (const requirement of transport.optionalModes) {
                if (requirement.required) {
                    const mode = requirement.mode;
                    const reminder = this.createBookingReminder(mode, requirement, countryCode, true, false);
                    if (reminder) {
                        reminders.push(reminder);
                    }
                }
            }
        }
        const neptuneActions = this.generateNeptuneActions(unavailableModes, alternativeStrategies, reminders);
        const summary = {
            totalReminders: reminders.length,
            criticalReminders: reminders.filter(r => r.urgency === 'critical' || r.urgency === 'high').length,
            estimatedBookingDaysAhead: Math.max(...reminders.map(r => r.timeWindow.recommendedDaysAhead), 0),
            unavailableModes: unavailableModes.length > 0 ? unavailableModes : undefined,
        };
        return {
            reminders,
            summary,
            alternativeStrategies,
            neptuneActions,
        };
    }
    createBookingReminder(mode, requirement, countryCode, isAvailable, isBooked) {
        var _a, _b, _c, _d;
        const config = this.getModeConfig(mode, countryCode);
        if (!config) {
            return null;
        }
        return {
            mode,
            title: config.title,
            description: isBooked
                ? `${config.title}已预订。`
                : isAvailable
                    ? `${config.title}需要提前预订。${config.description}`
                    : `${config.title}当前不可用。建议使用备选方案。`,
            urgency: isBooked
                ? 'low'
                : !isAvailable
                    ? 'critical'
                    : config.urgency,
            timeWindow: {
                recommendedDaysAhead: config.recommendedDaysAhead,
                bookingDeadline: config.bookingDeadline,
                seasonality: config.seasonality,
            },
            bookingInfo: {
                operator: ((_a = requirement.hints) === null || _a === void 0 ? void 0 : _a.operator) || config.operator,
                bookingLink: ((_b = requirement.hints) === null || _b === void 0 ? void 0 : _b.bookingLink) || config.bookingLink,
                estimatedCost: config.estimatedCost,
                frequency: ((_c = requirement.hints) === null || _c === void 0 ? void 0 : _c.frequency) || config.frequency,
                duration: ((_d = requirement.hints) === null || _d === void 0 ? void 0 : _d.duration) || config.duration,
            },
            alternativeStrategies: !isAvailable || !isBooked
                ? this.generateAlternativeStrategies(mode, requirement, countryCode)
                : undefined,
        };
    }
    generateAlternativeStrategies(mode, requirement, countryCode, itineraryDraft) {
        const strategies = [];
        const alternativeMode = this.getAlternativeMode(mode, countryCode);
        if (alternativeMode) {
            strategies.push({
                strategy: 'replace_mode',
                description: `使用${this.getModeName(alternativeMode)}替代${this.getModeName(mode)}`,
                impact: 'medium',
                feasibility: 'moderate',
                details: {
                    alternativeMode,
                },
            });
        }
        const alternativeActivity = this.getAlternativeActivity(mode, countryCode);
        if (alternativeActivity) {
            strategies.push({
                strategy: 'replace_activity',
                description: `改为${alternativeActivity}，无需${this.getModeName(mode)}`,
                impact: 'high',
                feasibility: 'easy',
                details: {
                    alternativeActivity,
                },
            });
        }
        strategies.push({
            strategy: 'adjust_schedule',
            description: `调整日程，避开${this.getModeName(mode)}的依赖`,
            impact: 'low',
            feasibility: 'moderate',
            details: {
                scheduleAdjustment: '重新安排活动顺序，使用其他交通方式',
            },
        });
        if (mode === 'ferry' || mode === 'boat') {
            strategies.push({
                strategy: 'split_day',
                description: '将行程拆分为两天，使用陆路交通',
                impact: 'medium',
                feasibility: 'moderate',
                details: {
                    scheduleAdjustment: '增加一天行程，使用陆路替代水路',
                },
            });
        }
        return strategies;
    }
    generateNeptuneActions(unavailableModes, alternativeStrategies, reminders) {
        var _a, _b, _c;
        const actions = [];
        for (const mode of unavailableModes) {
            const strategy = alternativeStrategies.find(s => { var _a; return s.strategy === 'replace_mode' && ((_a = s.details) === null || _a === void 0 ? void 0 : _a.alternativeMode); });
            if (strategy) {
                actions.push({
                    action: 'REPLACE_MODE',
                    reason: `${this.getModeName(mode)}不可用`,
                    details: {
                        originalMode: mode,
                        alternativeMode: (_a = strategy.details) === null || _a === void 0 ? void 0 : _a.alternativeMode,
                    },
                });
            }
        }
        const replaceActivityStrategy = alternativeStrategies.find(s => s.strategy === 'replace_activity');
        if (replaceActivityStrategy) {
            actions.push({
                action: 'REPLACE_ACTIVITY',
                reason: '交通模式不可用，建议替换活动',
                details: {
                    alternativeActivity: (_b = replaceActivityStrategy.details) === null || _b === void 0 ? void 0 : _b.alternativeActivity,
                },
            });
        }
        const adjustScheduleStrategy = alternativeStrategies.find(s => s.strategy === 'adjust_schedule');
        if (adjustScheduleStrategy) {
            actions.push({
                action: 'ADJUST_SCHEDULE',
                reason: '需要调整日程以避开不可用的交通模式',
                details: {
                    scheduleAdjustment: (_c = adjustScheduleStrategy.details) === null || _c === void 0 ? void 0 : _c.scheduleAdjustment,
                },
            });
        }
        return actions.length > 0 ? actions : undefined;
    }
    checkBookingStatus(mode, userBookingStatus) {
        if (!userBookingStatus)
            return false;
        switch (mode) {
            case 'ferry':
            case 'boat':
                return userBookingStatus.ferryBooked || false;
            case 'flight':
                return userBookingStatus.flightBooked || false;
            case 'rail':
                return userBookingStatus.railBooked || false;
            default:
                return false;
        }
    }
    getModeConfig(mode, countryCode) {
        var _a;
        const configs = {
            'NZ': {
                ferry: {
                    title: 'Milford Sound 渡轮',
                    description: 'Milford Sound 是新西兰最著名的峡湾，需要提前预订渡轮票。',
                    urgency: 'high',
                    recommendedDaysAhead: 30,
                    seasonality: {
                        peakMonths: [12, 1, 2],
                        offPeakMonths: [6, 7, 8],
                    },
                    operator: 'Real Journeys',
                    bookingLink: 'https://www.realjourneys.co.nz',
                    estimatedCost: { min: 80, max: 150, currency: 'NZD' },
                    frequency: 'multiple daily',
                    duration: '2-3 hours',
                },
            },
            'NO': {
                ferry: {
                    title: '挪威峡湾渡轮',
                    description: '挪威峡湾渡轮是探索峡湾的主要方式，旺季需要提前预订。',
                    urgency: 'high',
                    recommendedDaysAhead: 21,
                    seasonality: {
                        peakMonths: [6, 7, 8],
                        offPeakMonths: [12, 1, 2],
                    },
                    operator: 'Fjord1',
                    bookingLink: 'https://www.fjord1.no',
                    estimatedCost: { min: 200, max: 500, currency: 'NOK' },
                    frequency: 'multiple daily',
                    duration: '1-4 hours',
                },
            },
            'SJ': {
                boat: {
                    title: '斯瓦尔巴出海',
                    description: '斯瓦尔巴出海需要提前预订，受天气影响较大。',
                    urgency: 'critical',
                    recommendedDaysAhead: 60,
                    seasonality: {
                        peakMonths: [6, 7, 8],
                        offPeakMonths: [12, 1, 2, 3],
                    },
                    operator: 'Svalbard Travel',
                    bookingLink: 'https://www.svalbardtravel.com',
                    estimatedCost: { min: 1000, max: 3000, currency: 'NOK' },
                    frequency: 'daily (weather permitting)',
                    duration: 'full day',
                },
            },
        };
        return ((_a = configs[countryCode]) === null || _a === void 0 ? void 0 : _a[mode]) || null;
    }
    getAlternativeMode(mode, countryCode) {
        var _a, _b;
        const alternatives = {
            ferry: {
                'NZ': 'drive',
                'NO': 'drive',
                default: 'bus',
            },
            boat: {
                'SJ': null,
                default: 'ferry',
            },
            flight: {
                default: 'rail',
            },
            rail: {
                default: 'bus',
            },
        };
        return ((_a = alternatives[mode]) === null || _a === void 0 ? void 0 : _a[countryCode]) || ((_b = alternatives[mode]) === null || _b === void 0 ? void 0 : _b.default) || null;
    }
    getAlternativeActivity(mode, countryCode) {
        var _a, _b;
        const alternatives = {
            ferry: {
                'NZ': 'Te Anau 湖游船或 Doubtful Sound 陆路探索',
                'NO': '峡湾观景台或陆路探索',
                default: '陆路替代活动',
            },
            boat: {
                'SJ': null,
                default: '陆路替代活动',
            },
            flight: {
                default: '使用其他交通方式',
            },
            rail: {
                default: '使用巴士或自驾',
            },
        };
        return ((_a = alternatives[mode]) === null || _a === void 0 ? void 0 : _a[countryCode]) || ((_b = alternatives[mode]) === null || _b === void 0 ? void 0 : _b.default) || null;
    }
    getModeName(mode) {
        const names = {
            ferry: '渡轮',
            boat: '出海',
            flight: '航班',
            rail: '铁路',
            bus: '巴士',
            drive: '自驾',
        };
        return names[mode] || mode;
    }
};
exports.TransportPluginService = TransportPluginService;
exports.TransportPluginService = TransportPluginService = TransportPluginService_1 = __decorate([
    (0, common_1.Injectable)()
], TransportPluginService);
//# sourceMappingURL=transport-plugin.service.js.map