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
var RailPassRuleEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassRuleEngineService = void 0;
const common_1 = require("@nestjs/common");
let RailPassRuleEngineService = RailPassRuleEngineService_1 = class RailPassRuleEngineService {
    constructor() {
        this.logger = new common_1.Logger(RailPassRuleEngineService_1.name);
        this.rules = [];
        this.initializeRules();
    }
    initializeRules() {
        this.rules.push({
            id: 'PASS_COVERAGE_CHECK',
            name: 'Pass 覆盖校验',
            condition: (args) => {
                return args.passProfile.passType === 'GLOBAL';
            },
            effect: {
                type: 'HARD_CONSTRAINT',
                errorMessage: '该线路不在 Pass 覆盖范围内',
            },
            severity: 'error',
            evidence: {
                source: 'Interrail Official Rules',
                reference: 'https://www.interrail.eu/en/plan-your-trip/interrail-passes/interrail-global-pass',
            },
            description: 'Global Pass 覆盖的是一组国家 + 一组合作铁路/轮渡伙伴，但并非所有线路都覆盖。城市地铁/公交/有轨电车通常不包含。',
        });
        this.rules.push({
            id: 'HOME_COUNTRY_OUTBOUND_INBOUND_LIMIT',
            name: 'Interrail 居住国使用限制',
            condition: (args) => {
                if (args.passProfile.passFamily !== 'INTERRAIL')
                    return false;
                if (args.passProfile.passType !== 'GLOBAL')
                    return false;
                const isResidencyCountrySegment = args.segment.fromCountryCode === args.passProfile.residencyCountry ||
                    args.segment.toCountryCode === args.passProfile.residencyCountry;
                if (!isResidencyCountrySegment)
                    return false;
                return false;
            },
            effect: {
                type: 'HARD_CONSTRAINT',
                errorMessage: 'Interrail Global Pass 在居住国只能使用 1 个 outbound + 1 个 inbound（共 2 次），且都占用 travel day，不是额外送的天数',
            },
            severity: 'error',
            evidence: {
                source: 'Interrail Official Rules',
                reference: 'https://www.interrail.eu/en/help/faq/pass-validity',
            },
            description: 'Interrail Global Pass 在居住国只能用 1 个 outbound（离境）+ 1 个 inbound（返程），共 2 次机会。它们占用你的 travel day，不是额外送的天数。同一天多次换乘仍算 1 travel day。',
        });
        this.rules.push({
            id: 'TRAVEL_DAY_MIDNIGHT_TRANSFER',
            name: '夜车计日规则：过午夜换乘需算 2 天',
            condition: (args) => {
                if (args.passProfile.validityType !== 'FLEXI')
                    return false;
                return args.segment.isNightTrain &&
                    args.segment.crossesMidnight === true;
            },
            effect: {
                type: 'TRAVEL_DAY_CONSUMPTION',
                value: 2,
            },
            severity: 'warning',
            evidence: {
                source: 'Eurail Official Rules',
            },
            description: '夜车计日规则：不换乘可只算出发日 1 天；过午夜换乘要算 2 天（出发日 + 到达日）',
        });
        this.rules.push({
            id: 'LAST_DAY_NIGHT_TRAIN',
            name: '有效期最后一天不能乘坐跨日夜车',
            condition: (args) => {
                if (!args.isLastDayOfValidity)
                    return false;
                return args.segment.isNightTrain && args.segment.crossesMidnight === true;
            },
            effect: {
                type: 'HARD_CONSTRAINT',
                errorMessage: 'Pass 在有效期最后一天 23:59 过期，不能乘坐需要跨到次日的夜车',
                fallbackOptions: ['SWITCH_TO_DAY_TRAIN', 'MOVE_TO_PREVIOUS_DAY'],
            },
            severity: 'error',
            evidence: {
                source: 'Eurail Official Rules',
            },
            description: 'Pass 在有效期最后一天 23:59 到期，因此不能用来乘坐会跨到次日的夜车（因为 validity 到 23:59 就结束）',
        });
        this.rules.push({
            id: 'RESERVATION_REQUIRED',
            name: '必须订座但未订',
            condition: (args) => {
                if (!args.reservationTask)
                    return false;
                const required = args.segment.isNightTrain || args.segment.isHighSpeed;
                return required && args.reservationTask.status !== 'BOOKED';
            },
            effect: {
                type: 'HARD_CONSTRAINT',
                errorMessage: '该段必须订座但尚未订座，无法执行',
                fallbackOptions: ['BOOK_RESERVATION', 'SWITCH_TO_SLOW_TRAIN', 'SHIFT_TIME'],
            },
            severity: 'error',
            evidence: {
                source: 'Eurail Official Rules',
            },
            description: '多数高速列车、以及所有夜车都需要（或强烈建议）订座；夜车订铺位更是硬性。没有订座可能无法上车。',
        });
        this.rules.push({
            id: 'RESERVATION_QUOTA_RISK',
            name: '订座配额紧张风险',
            condition: (args) => {
                const isHotRoute = args.segment.isInternational &&
                    (args.segment.fromCountryCode === 'FR' || args.segment.toCountryCode === 'GB');
                return isHotRoute;
            },
            effect: {
                type: 'RISK_LEVEL',
                riskLevel: 'HIGH',
                fallbackOptions: ['BOOK_EARLY', 'SHIFT_TIME', 'SWITCH_TO_ALTERNATIVE_ROUTE'],
            },
            severity: 'warning',
            evidence: {
                source: 'Eurostar Official Guidelines',
            },
            description: 'Eurostar 等热门线路存在 passholder seat 配额/票价桶机制，确实会出现"有车但 Pass 名额没了"的情况。建议尽早订座（Eurostar 建议尽早订，会放出提前期，但会卖完）',
        });
        this.rules.push({
            id: 'CITY_TRANSPORT_NOT_COVERED',
            name: '市内交通不在 Pass 覆盖',
            condition: (args) => {
                return false;
            },
            effect: {
                type: 'BUDGET_IMPACT',
                value: 0,
            },
            severity: 'info',
            evidence: {
                source: 'Eurail Community',
            },
            description: '城市地铁/公交/有轨电车通常不包含在 Global Pass 内，需要另外预算',
        });
    }
    evaluateRules(args) {
        var _a;
        const triggeredRules = [];
        let hasErrors = false;
        let maxRisk = 'LOW';
        const validityEndDate = new Date(args.passProfile.validityEndDate);
        for (const segment of args.segments) {
            const segmentDate = new Date(segment.departureDate);
            const isLastDayOfValidity = segmentDate.getTime() === validityEndDate.getTime();
            const reservationTask = (_a = args.reservationTasks) === null || _a === void 0 ? void 0 : _a.find(t => t.segmentId === segment.segmentId);
            for (const rule of this.rules) {
                const conditionArgs = {
                    segment,
                    passProfile: args.passProfile,
                    reservationTask,
                    allSegments: args.segments,
                    travelDayResult: args.travelDayResult,
                    isLastDayOfValidity,
                };
                if (rule.condition(conditionArgs)) {
                    triggeredRules.push({
                        rule,
                        segmentId: segment.segmentId,
                        effect: rule.effect,
                        message: this.generateRuleMessage(rule, segment),
                    });
                    if (rule.severity === 'error') {
                        hasErrors = true;
                    }
                    if (rule.effect.type === 'RISK_LEVEL' && rule.effect.riskLevel) {
                        const riskOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
                        if (riskOrder[rule.effect.riskLevel] > riskOrder[maxRisk]) {
                            maxRisk = rule.effect.riskLevel;
                        }
                    }
                }
            }
        }
        return {
            triggeredRules,
            hasErrors,
            overallRisk: hasErrors ? 'HIGH' : maxRisk,
        };
    }
    generateRuleMessage(rule, segment) {
        var _a;
        if (rule.effect.errorMessage) {
            return rule.effect.errorMessage;
        }
        switch (rule.effect.type) {
            case 'TRAVEL_DAY_CONSUMPTION':
                return `该段将消耗 ${rule.effect.value} 个 Travel Day`;
            case 'RISK_LEVEL':
                return `风险等级：${rule.effect.riskLevel}`;
            case 'FALLBACK_REQUIRED':
                return `需要备用方案：${(_a = rule.effect.fallbackOptions) === null || _a === void 0 ? void 0 : _a.join(', ')}`;
            default:
                return rule.description;
        }
    }
    getAllRules() {
        return [...this.rules];
    }
    getRuleById(ruleId) {
        return this.rules.find(r => r.id === ruleId);
    }
};
exports.RailPassRuleEngineService = RailPassRuleEngineService;
exports.RailPassRuleEngineService = RailPassRuleEngineService = RailPassRuleEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RailPassRuleEngineService);
//# sourceMappingURL=railpass-rule-engine.service.js.map