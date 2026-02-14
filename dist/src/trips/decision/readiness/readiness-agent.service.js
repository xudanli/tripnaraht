"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ReadinessAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessAgentService = void 0;
const common_1 = require("@nestjs/common");
let ReadinessAgentService = ReadinessAgentService_1 = class ReadinessAgentService {
    constructor() {
        this.logger = new common_1.Logger(ReadinessAgentService_1.name);
    }
    run(world, plan) {
        var _a;
        const items = [];
        items.push(...this.deriveFromPhysicalReality(world.physical, world.human));
        items.push(...this.deriveFromHumanCapability(world.human));
        items.push(...this.deriveFromRouteDirection(world.routeDirection));
        items.push(...this.deriveFromTripPlan(plan, world));
        const itemsByType = {
            GEAR: items.filter(i => i.type === 'GEAR'),
            DOCUMENT: items.filter(i => i.type === 'DOCUMENT'),
            HEALTH: items.filter(i => i.type === 'HEALTH'),
            SKILL: items.filter(i => i.type === 'SKILL'),
        };
        const itemsBySeverity = {
            MUST: items.filter(i => i.severity === 'MUST'),
            SHOULD: items.filter(i => i.severity === 'SHOULD'),
            OPTIONAL: items.filter(i => i.severity === 'OPTIONAL'),
        };
        const summary = this.generateSummary(itemsBySeverity, world);
        const routeId = ((_a = world.routeDirection.id) === null || _a === void 0 ? void 0 : _a.toString()) ||
            world.routeDirection.uuid ||
            undefined;
        return {
            routeId,
            summary,
            items,
            itemsByType,
            itemsBySeverity,
        };
    }
    deriveFromPhysicalReality(physical, human) {
        var _a, _b, _c, _d;
        const items = [];
        for (const roadState of physical.roadStates) {
            if (roadState.requires4x4) {
                items.push({
                    id: `gear-4x4-${roadState.roadId}`,
                    type: 'GEAR',
                    severity: 'MUST',
                    title: '4x4 车辆',
                    description: `路线包含需要 4x4 的路段：${roadState.roadId}`,
                    reasonSignals: ['F-road', 'requires4x4', roadState.roadId],
                });
            }
            if (roadState.requiresPermit) {
                items.push({
                    id: `doc-permit-${roadState.roadId}`,
                    type: 'DOCUMENT',
                    severity: 'MUST',
                    title: '道路许可证',
                    description: `路段 ${roadState.roadId} 需要许可证`,
                    reasonSignals: ['road_requires_permit', roadState.roadId],
                });
            }
        }
        for (const hazard of physical.hazardZones) {
            if (hazard.level === 'HIGH' || hazard.level === 'MEDIUM') {
                const severity = hazard.level === 'HIGH' ? 'MUST' : 'SHOULD';
                let title = '';
                let description = '';
                switch (hazard.type) {
                    case 'AVALANCHE':
                        title = '雪崩安全装备';
                        description = '路线经过雪崩风险区域，需要携带雪崩安全装备（信标、铲子、探针）';
                        break;
                    case 'MUDSLIDE':
                        title = '泥石流风险意识';
                        description = '路线经过泥石流风险区域，需要关注天气预警';
                        break;
                    case 'FLOOD':
                        title = '涉水准备';
                        description = '路线可能涉及涉水路段，需要准备防水装备';
                        break;
                    case 'ICE':
                        title = '冰爪/防滑装备';
                        description = '路线涉及冰雪路段，需要冰爪或防滑装备';
                        break;
                    default:
                        title = '风险区域安全装备';
                        description = `路线经过 ${hazard.type} 风险区域`;
                }
                items.push({
                    id: `gear-hazard-${hazard.zoneId}`,
                    type: 'GEAR',
                    severity,
                    title,
                    description,
                    reasonSignals: [`hazard_${hazard.type}`, `level_${hazard.level}`, hazard.zoneId],
                });
            }
        }
        if (physical.climateSeasonality) {
            const climate = physical.climateSeasonality;
            if ((_a = climate.riskFactors) === null || _a === void 0 ? void 0 : _a.includes('snow')) {
                items.push({
                    id: 'gear-winter-clothing',
                    type: 'GEAR',
                    severity: 'MUST',
                    title: '冬季保暖装备',
                    description: '目的地在该月份有降雪，需要保暖衣物和防滑装备',
                    reasonSignals: ['climate_snow', `month_${physical.month}`],
                });
            }
            if ((_b = climate.riskFactors) === null || _b === void 0 ? void 0 : _b.includes('high_wind')) {
                items.push({
                    id: 'gear-wind-protection',
                    type: 'GEAR',
                    severity: 'SHOULD',
                    title: '防风装备',
                    description: '目的地在该月份风力较大，建议携带防风装备',
                    reasonSignals: ['climate_high_wind', `month_${physical.month}`],
                });
            }
            if (((_c = climate.typicalWeather) === null || _c === void 0 ? void 0 : _c.temperatureCelsius) && climate.typicalWeather.temperatureCelsius < 0) {
                items.push({
                    id: 'gear-cold-weather',
                    type: 'GEAR',
                    severity: 'MUST',
                    title: '防寒装备',
                    description: `目的地该月份平均气温 ${climate.typicalWeather.temperatureCelsius}°C，需要防寒装备`,
                    reasonSignals: ['climate_cold', `temp_${climate.typicalWeather.temperatureCelsius}`],
                });
            }
        }
        for (const demEvidence of physical.demEvidence) {
            if ((_d = demEvidence.metadata) === null || _d === void 0 ? void 0 : _d.elevationRange) {
                const maxElev = demEvidence.metadata.elevationRange.max;
                if (maxElev > 3000) {
                    const severity = maxElev > 4500 ? 'MUST' : 'SHOULD';
                    items.push({
                        id: `health-altitude-${demEvidence.segmentId}`,
                        type: 'HEALTH',
                        severity,
                        title: '高海拔适应准备',
                        description: `路线最高海拔 ${Math.round(maxElev)} 米，需要高海拔适应准备`,
                        reasonSignals: ['high_altitude', `elevation_${Math.round(maxElev)}`, demEvidence.segmentId],
                    });
                    if (human.highAltitudeExperience === 'NONE' && maxElev > 3500) {
                        items.push({
                            id: 'health-altitude-checkup',
                            type: 'HEALTH',
                            severity: 'SHOULD',
                            title: '高海拔体检',
                            description: '建议出发前进行高海拔适应性体检',
                            reasonSignals: ['no_altitude_experience', `elevation_${Math.round(maxElev)}`],
                        });
                    }
                }
            }
        }
        return items;
    }
    deriveFromHumanCapability(human) {
        var _a, _b;
        const items = [];
        if (((_a = human.metadata) === null || _a === void 0 ? void 0 : _a.kneeIssues) || ((_b = human.metadata) === null || _b === void 0 ? void 0 : _b.kneeProblems)) {
            items.push({
                id: 'gear-knee-support',
                type: 'GEAR',
                severity: 'SHOULD',
                title: '护膝/支撑装备',
                description: '建议携带护膝或膝关节支撑装备，减轻徒步时的膝盖负担',
                reasonSignals: ['knee_issues'],
            });
        }
        if (human.requiresGradualAscent) {
            items.push({
                id: 'health-gradual-ascent',
                type: 'HEALTH',
                severity: 'SHOULD',
                title: '渐进式海拔适应计划',
                description: '需要制定渐进式海拔适应计划，避免高反',
                reasonSignals: ['requires_gradual_ascent', `max_elevation_${human.maxElevationM || 'unknown'}`],
            });
        }
        if (human.maxDailyAscentM < 500) {
            items.push({
                id: 'health-fitness-training',
                type: 'HEALTH',
                severity: 'OPTIONAL',
                title: '体能训练建议',
                description: '建议出发前进行体能训练，提高单日爬升能力',
                reasonSignals: ['low_daily_ascent', `max_${human.maxDailyAscentM}m`],
            });
        }
        if (human.riskTolerance === 'LOW') {
            items.push({
                id: 'skill-risk-awareness',
                type: 'SKILL',
                severity: 'OPTIONAL',
                title: '风险评估技能',
                description: '建议提前学习基本的安全评估技能',
                reasonSignals: ['low_risk_tolerance'],
            });
        }
        return items;
    }
    deriveFromRouteDirection(routeDirection) {
        const items = [];
        const tags = routeDirection.tags || [];
        if (tags.some(t => t.includes('glacier') || t.includes('冰川'))) {
            items.push({
                id: 'gear-glacier-equipment',
                type: 'GEAR',
                severity: 'MUST',
                title: '冰川徒步装备',
                description: '路线涉及冰川徒步，需要专业装备（冰爪、冰镐等）',
                reasonSignals: ['glacier_hiking', ...tags.filter(t => t.includes('glacier') || t.includes('冰川'))],
            });
        }
        if (tags.some(t => t.includes('F-road') || t.includes('F路'))) {
            items.push({
                id: 'gear-froad-vehicle',
                type: 'GEAR',
                severity: 'MUST',
                title: '4x4 越野车辆',
                description: '路线包含 F-road，必须使用 4x4 车辆',
                reasonSignals: ['F-road', ...tags.filter(t => t.includes('F-road') || t.includes('F路'))],
            });
        }
        if (tags.some(t => t.includes('river') || t.includes('河流') || t.includes('涉水'))) {
            items.push({
                id: 'gear-river-crossing',
                type: 'GEAR',
                severity: 'SHOULD',
                title: '涉水装备',
                description: '路线可能涉及河流涉水，建议准备涉水装备',
                reasonSignals: ['river_crossing', ...tags.filter(t => t.includes('river') || t.includes('河流') || t.includes('涉水'))],
            });
        }
        if (tags.some(t => t.includes('ocean') || t.includes('出海') || t.includes('boat'))) {
            items.push({
                id: 'health-seasickness',
                type: 'HEALTH',
                severity: 'OPTIONAL',
                title: '晕船药',
                description: '路线包含出海活动，建议准备晕船药',
                reasonSignals: ['ocean_activity', ...tags.filter(t => t.includes('ocean') || t.includes('出海') || t.includes('boat'))],
            });
        }
        if (tags.some(t => t.includes('trek') || t.includes('多日') || t.includes('backpack'))) {
            items.push({
                id: 'gear-backpacking',
                type: 'GEAR',
                severity: 'MUST',
                title: '多日徒步装备',
                description: '路线涉及多日徒步，需要完整的背包装备',
                reasonSignals: ['multi_day_trek', ...tags.filter(t => t.includes('trek') || t.includes('多日') || t.includes('backpack'))],
            });
        }
        if (routeDirection.complianceRules) {
            const compliance = routeDirection.complianceRules;
            if (compliance.requiresPermit) {
                items.push({
                    id: 'doc-route-permit',
                    type: 'DOCUMENT',
                    severity: 'MUST',
                    title: '路线许可证',
                    description: '该路线需要特殊许可证',
                    reasonSignals: ['route_requires_permit'],
                });
            }
            if (compliance.requiresGuide) {
                items.push({
                    id: 'skill-guide-service',
                    type: 'SKILL',
                    severity: 'MUST',
                    title: '向导服务',
                    description: '该路线必须配备向导',
                    reasonSignals: ['requires_guide'],
                });
            }
        }
        return items;
    }
    deriveFromTripPlan(plan, world) {
        var _a;
        const items = [];
        if (plan.days.length > 7) {
            items.push({
                id: 'gear-extended-trip',
                type: 'GEAR',
                severity: 'SHOULD',
                title: '长期旅行装备',
                description: `行程 ${plan.days.length} 天，建议准备充足的换洗衣物和日用品`,
                reasonSignals: [`duration_${plan.days.length}days`],
            });
        }
        let maxElevationInPlan = 0;
        for (const day of plan.days) {
            if ((_a = day.terrainFacts) === null || _a === void 0 ? void 0 : _a.maxElevation) {
                maxElevationInPlan = Math.max(maxElevationInPlan, day.terrainFacts.maxElevation);
            }
        }
        if (maxElevationInPlan > 0 && maxElevationInPlan > 3000) {
            items.push({
                id: 'health-elevation-monitoring',
                type: 'HEALTH',
                severity: 'SHOULD',
                title: '海拔监测设备',
                description: `行程最高海拔 ${Math.round(maxElevationInPlan)} 米，建议携带海拔表或智能手表监测`,
                reasonSignals: [`plan_max_elevation_${Math.round(maxElevationInPlan)}`],
            });
        }
        return items;
    }
    generateSummary(itemsBySeverity, world) {
        const mustCount = itemsBySeverity.MUST.length;
        const shouldCount = itemsBySeverity.SHOULD.length;
        const optionalCount = itemsBySeverity.OPTIONAL.length;
        const parts = [];
        if (mustCount > 0) {
            parts.push(`${mustCount} 项必须准备`);
        }
        if (shouldCount > 0) {
            parts.push(`${shouldCount} 项建议准备`);
        }
        if (optionalCount > 0) {
            parts.push(`${optionalCount} 项可选准备`);
        }
        return `本次行程共需要准备 ${mustCount + shouldCount + optionalCount} 项内容：${parts.join('，')}。`;
    }
};
exports.ReadinessAgentService = ReadinessAgentService;
exports.ReadinessAgentService = ReadinessAgentService = ReadinessAgentService_1 = __decorate([
    (0, common_1.Injectable)()
], ReadinessAgentService);
//# sourceMappingURL=readiness-agent.service.js.map