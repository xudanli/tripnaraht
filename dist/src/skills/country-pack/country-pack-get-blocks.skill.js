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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CountryPackGetBlocksSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackGetBlocksSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const country_pack_config_1 = require("../../trips/readiness/config/country-pack.config");
const pack_storage_service_1 = require("../../trips/readiness/storage/pack-storage.service");
let CountryPackGetBlocksSkill = CountryPackGetBlocksSkill_1 = class CountryPackGetBlocksSkill {
    constructor(prisma, packStorage) {
        this.prisma = prisma;
        this.packStorage = packStorage;
        this.logger = new common_1.Logger(CountryPackGetBlocksSkill_1.name);
        this.metadata = {
            name: 'countryPack.getBlocks',
            description: '按主题获取国家包块：根据 topics 从 CountryPack 中提取 Visa/Drone/RoadRules/Money/Safety/WeatherWindows/LocalTransport/BookingNorms 等主题块',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.getBlocks: packId=${input.packId}, topics=${input.topics.join(', ')}`);
        const blocks = [];
        const missingTopics = [];
        try {
            let countryCode;
            let countryName;
            let packData;
            if (this.prisma && this.packStorage) {
                try {
                    const readinessPack = await this.prisma.readinessPack.findUnique({
                        where: { packId: input.packId },
                    });
                    if (readinessPack) {
                        countryCode = readinessPack.countryCode;
                        countryName = readinessPack.displayName;
                        packData = readinessPack.packData;
                    }
                    else {
                        countryCode = input.packId;
                        const countryPack = (0, country_pack_config_1.getCountryPack)(countryCode);
                        countryName = countryPack.countryName;
                        packData = countryPack;
                    }
                }
                catch (error) {
                    countryCode = input.packId;
                    const countryPack = (0, country_pack_config_1.getCountryPack)(countryCode);
                    countryName = countryPack.countryName;
                    packData = countryPack;
                }
            }
            else {
                countryCode = input.packId;
                const countryPack = (0, country_pack_config_1.getCountryPack)(countryCode);
                countryName = countryPack.countryName;
                packData = countryPack;
            }
            for (const topic of input.topics) {
                const block = this.extractTopicBlock(topic, packData, countryCode, countryName);
                if (block) {
                    const blockWithEvidence = this.addEvidenceToBlock(block, packData, countryCode);
                    blocks.push(blockWithEvidence);
                }
                else {
                    missingTopics.push(topic);
                }
            }
            return {
                blocks,
                missingTopics,
                packMetadata: {
                    packId: input.packId,
                    countryCode,
                    countryName,
                },
            };
        }
        catch (error) {
            this.logger.error(`获取国家包块失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    addEvidenceToBlock(block, packData, countryCode, additionalMetadata) {
        const lastReviewedAt = packData.lastReviewedAt || new Date().toISOString();
        return {
            ...block,
            evidence: [
                {
                    source: `CountryPack:${countryCode}`,
                    verifiedAt: lastReviewedAt,
                    confidence: 0.9,
                    metadata: {
                        packVersion: packData.version,
                        ...additionalMetadata,
                    },
                },
            ],
            dataSource: 'PACK',
            lastVerifiedAt: lastReviewedAt,
        };
    }
    extractTopicBlock(topic, packData, countryCode, countryName) {
        switch (topic) {
            case 'VISA':
                return this.extractVisaBlock(packData, countryCode, countryName);
            case 'DRONE':
                return this.extractDroneBlock(packData, countryCode, countryName);
            case 'ROAD_RULES':
                return this.extractRoadRulesBlock(packData, countryCode, countryName);
            case 'MONEY':
                return this.extractMoneyBlock(packData, countryCode, countryName);
            case 'SAFETY':
                return this.extractSafetyBlock(packData, countryCode, countryName);
            case 'WEATHER_WINDOWS':
                return this.extractWeatherWindowsBlock(packData, countryCode, countryName);
            case 'LOCAL_TRANSPORT':
                return this.extractLocalTransportBlock(packData, countryCode, countryName);
            case 'BOOKING_NORMS':
                return this.extractBookingNormsBlock(packData, countryCode, countryName);
            default:
                return null;
        }
    }
    extractVisaBlock(packData, countryCode, countryName) {
        var _a;
        const visaRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d, _e;
            return rule.category === 'entry_transit' ||
                ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('visa')) ||
                ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('visa')) ||
                ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.tasks) === null || _e === void 0 ? void 0 : _e.some((task) => { var _a; return (_a = task.tags) === null || _a === void 0 ? void 0 : _a.includes('visa'); }));
        })) || [];
        if (visaRules.length === 0) {
            return null;
        }
        const visaMessages = visaRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            return `- ${message}`;
        })
            .join('\n');
        const visaTasks = visaRules
            .flatMap((rule) => { var _a; return ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.tasks) || []; })
            .filter((task) => { var _a; return (_a = task.tags) === null || _a === void 0 ? void 0 : _a.includes('visa'); })
            .map((task) => {
            var _a, _b;
            const title = typeof task.title === 'string' ? task.title : ((_a = task.title) === null || _a === void 0 ? void 0 : _a.en) || ((_b = task.title) === null || _b === void 0 ? void 0 : _b.zh) || '';
            return `  • ${title}${task.dueOffsetDays ? ` (提前 ${Math.abs(task.dueOffsetDays)} 天)` : ''}`;
        })
            .join('\n');
        const text = `${countryName} 签证要求:\n${visaMessages}${visaTasks ? `\n\n需要完成的任务:\n${visaTasks}` : ''}`;
        return {
            key: `COUNTRY_VISA_${countryCode}`,
            type: 'COUNTRY_VISA',
            text,
            priority: 80,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
            data: {
                rules: visaRules.map((rule) => {
                    var _a;
                    return ({
                        id: rule.id,
                        category: rule.category,
                        severity: rule.severity,
                        message: (_a = rule.then) === null || _a === void 0 ? void 0 : _a.message,
                    });
                }),
            },
        };
    }
    extractDroneBlock(packData, countryCode, countryName) {
        var _a, _b;
        const droneRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('drone')) ||
                ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('drone')) ||
                ((_f = (_e = (_d = rule.when) === null || _d === void 0 ? void 0 : _d.containsAny) === null || _e === void 0 ? void 0 : _e.values) === null || _f === void 0 ? void 0 : _f.some((v) => v.toLowerCase().includes('drone'))) ||
                ((_h = (_g = rule.then) === null || _g === void 0 ? void 0 : _g.tasks) === null || _h === void 0 ? void 0 : _h.some((task) => {
                    var _a, _b;
                    return ((_a = task.title) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('drone')) ||
                        ((_b = task.tags) === null || _b === void 0 ? void 0 : _b.includes('drone'));
                }));
        })) || [];
        const droneChecklists = ((_b = packData.checklists) === null || _b === void 0 ? void 0 : _b.filter((checklist) => {
            var _a;
            return (_a = checklist.items) === null || _a === void 0 ? void 0 : _a.some((item) => {
                const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
                return itemText.toLowerCase().includes('drone');
            });
        })) || [];
        if (droneRules.length === 0 && droneChecklists.length === 0) {
            return null;
        }
        const rulesText = droneRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            return `- ${message}`;
        })
            .join('\n');
        const checklistText = droneChecklists
            .flatMap((checklist) => checklist.items || [])
            .filter((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return itemText.toLowerCase().includes('drone');
        })
            .map((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return `  • ${itemText}`;
        })
            .join('\n');
        const text = `${countryName} 无人机规则:\n${rulesText}${checklistText ? `\n\n检查清单:\n${checklistText}` : ''}`;
        return {
            key: `COUNTRY_DRONE_${countryCode}`,
            type: 'COUNTRY_DRONE',
            text,
            priority: 70,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
            data: {
                rules: droneRules.map((rule) => ({
                    id: rule.id,
                    category: rule.category,
                    severity: rule.severity,
                })),
            },
        };
    }
    extractRoadRulesBlock(packData, countryCode, countryName) {
        var _a, _b;
        const riskThresholds = packData.riskThresholds;
        const roadRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d;
            return rule.category === 'safety_hazards' ||
                ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('road')) ||
                ((_b = rule.id) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('terrain')) ||
                ((_c = rule.id) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('f-road')) ||
                ((_d = rule.id) === null || _d === void 0 ? void 0 : _d.toLowerCase().includes('driving'));
        })) || [];
        const terrainHazards = ((_b = packData.hazards) === null || _b === void 0 ? void 0 : _b.filter((hazard) => hazard.type === 'terrain' || hazard.type === 'weather_extreme')) || [];
        const parts = [];
        if (riskThresholds) {
            parts.push(`道路规则阈值:`);
            if (riskThresholds.highAltitudeM) {
                parts.push(`  高海拔阈值: ${riskThresholds.highAltitudeM}m`);
            }
            if (riskThresholds.steepSlopePct) {
                parts.push(`  陡坡阈值: ${riskThresholds.steepSlopePct}%`);
            }
            if (riskThresholds.rapidAscentM) {
                parts.push(`  快速爬升阈值: ${riskThresholds.rapidAscentM}m`);
            }
            if (riskThresholds.bigAscentDayM) {
                parts.push(`  单日最大爬升: ${riskThresholds.bigAscentDayM}m`);
            }
        }
        if (roadRules.length > 0) {
            parts.push(`\n道路安全规则:`);
            roadRules.forEach((rule) => {
                var _a, _b, _c, _d, _e;
                const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                    ? rule.then.message
                    : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
                parts.push(`  - ${message}`);
            });
        }
        if (terrainHazards.length > 0) {
            parts.push(`\n地形风险:`);
            terrainHazards.forEach((hazard) => {
                var _a, _b;
                const summary = typeof hazard.summary === 'string'
                    ? hazard.summary
                    : ((_a = hazard.summary) === null || _a === void 0 ? void 0 : _a.en) || ((_b = hazard.summary) === null || _b === void 0 ? void 0 : _b.zh) || '';
                parts.push(`  - ${summary} (严重程度: ${hazard.severity})`);
            });
        }
        if (parts.length === 0 && !riskThresholds) {
            return null;
        }
        const text = `${countryName} 道路规则:\n${parts.join('\n')}`;
        return {
            key: `COUNTRY_ROAD_RULES_${countryCode}`,
            type: 'COUNTRY_ROAD_RULES',
            text,
            priority: 85,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
            data: {
                riskThresholds,
                rules: roadRules.map((rule) => ({
                    id: rule.id,
                    category: rule.category,
                    severity: rule.severity,
                })),
                hazards: terrainHazards.map((hazard) => ({
                    type: hazard.type,
                    severity: hazard.severity,
                })),
            },
        };
    }
    extractMoneyBlock(packData, countryCode, countryName) {
        var _a, _b;
        const moneyRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            return rule.category === 'logistics' ||
                ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('money')) ||
                ((_b = rule.id) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('currency')) ||
                ((_c = rule.id) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('payment')) ||
                ((_d = rule.id) === null || _d === void 0 ? void 0 : _d.toLowerCase().includes('cash')) ||
                ((_f = (_e = rule.then) === null || _e === void 0 ? void 0 : _e.message) === null || _f === void 0 ? void 0 : _f.toLowerCase().includes('currency')) ||
                ((_h = (_g = rule.then) === null || _g === void 0 ? void 0 : _g.message) === null || _h === void 0 ? void 0 : _h.toLowerCase().includes('payment'));
        })) || [];
        const moneyChecklists = ((_b = packData.checklists) === null || _b === void 0 ? void 0 : _b.filter((checklist) => {
            var _a;
            return checklist.category === 'logistics' ||
                ((_a = checklist.items) === null || _a === void 0 ? void 0 : _a.some((item) => {
                    const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
                    return itemText.toLowerCase().match(/(currency|payment|cash|money|atm|credit card)/i);
                }));
        })) || [];
        if (moneyRules.length === 0 && moneyChecklists.length === 0) {
            return null;
        }
        const rulesText = moneyRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            return `- ${message}`;
        })
            .join('\n');
        const checklistText = moneyChecklists
            .flatMap((checklist) => checklist.items || [])
            .filter((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return itemText.toLowerCase().match(/(currency|payment|cash|money|atm|credit card)/i);
        })
            .map((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return `  • ${itemText}`;
        })
            .join('\n');
        const text = `${countryName} 货币和支付习惯:\n${rulesText}${checklistText ? `\n\n支付相关检查:\n${checklistText}` : ''}`;
        return {
            key: `COUNTRY_MONEY_${countryCode}`,
            type: 'COUNTRY_MONEY',
            text,
            priority: 60,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
        };
    }
    extractSafetyBlock(packData, countryCode, countryName) {
        var _a;
        const safetyRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => rule.category === 'safety_hazards')) || [];
        const hazards = packData.hazards || [];
        if (safetyRules.length === 0 && hazards.length === 0) {
            return null;
        }
        const rulesText = safetyRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            const severity = rule.severity === 'high' ? '⚠️' : rule.severity === 'medium' ? '⚡' : '';
            return `${severity} ${message} (${rule.severity})`;
        })
            .join('\n');
        const hazardsText = hazards
            .map((hazard) => {
            var _a, _b, _c;
            const summary = typeof hazard.summary === 'string'
                ? hazard.summary
                : ((_a = hazard.summary) === null || _a === void 0 ? void 0 : _a.en) || ((_b = hazard.summary) === null || _b === void 0 ? void 0 : _b.zh) || '';
            const mitigations = ((_c = hazard.mitigations) === null || _c === void 0 ? void 0 : _c.map((m) => {
                const mText = typeof m === 'string' ? m : m.en || m.zh || '';
                return `    - ${mText}`;
            }).join('\n')) || '';
            const severity = hazard.severity === 'high' ? '⚠️' : hazard.severity === 'medium' ? '⚡' : '';
            return `${severity} ${hazard.type}: ${summary}${mitigations ? `\n  缓解措施:\n${mitigations}` : ''}`;
        })
            .join('\n\n');
        const text = `${countryName} 安全信息:\n${rulesText}${hazardsText ? `\n\n风险提示:\n${hazardsText}` : ''}`;
        return {
            key: `COUNTRY_SAFETY_${countryCode}`,
            type: 'COUNTRY_SAFETY',
            text,
            priority: 90,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
            data: {
                rulesCount: safetyRules.length,
                hazardsCount: hazards.length,
                highSeverityCount: [...safetyRules, ...hazards].filter((r) => r.severity === 'high').length,
            },
        };
    }
    extractWeatherWindowsBlock(packData, countryCode, countryName) {
        return {
            key: `COUNTRY_WEATHER_${countryCode}`,
            type: 'COUNTRY_WEATHER',
            text: `${countryName} 天气窗口（待完善）`,
            priority: 75,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                timestamp: new Date().toISOString(),
            },
        };
    }
    extractLocalTransportBlock(packData, countryCode, countryName) {
        var _a, _b;
        const transportRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d, _e, _f, _g;
            return rule.category === 'logistics' ||
                ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('transport')) ||
                ((_b = rule.id) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('bus')) ||
                ((_c = rule.id) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('taxi')) ||
                ((_d = rule.id) === null || _d === void 0 ? void 0 : _d.toLowerCase().includes('car')) ||
                ((_e = rule.id) === null || _e === void 0 ? void 0 : _e.toLowerCase().includes('ferry')) ||
                ((_g = (_f = rule.then) === null || _f === void 0 ? void 0 : _f.message) === null || _g === void 0 ? void 0 : _g.toLowerCase().match(/(transport|bus|taxi|car|ferry|public transport)/i));
        })) || [];
        const transportChecklists = ((_b = packData.checklists) === null || _b === void 0 ? void 0 : _b.filter((checklist) => {
            var _a;
            return checklist.category === 'logistics' ||
                ((_a = checklist.items) === null || _a === void 0 ? void 0 : _a.some((item) => {
                    const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
                    return itemText.toLowerCase().match(/(transport|bus|taxi|car|ferry|public transport|rental)/i);
                }));
        })) || [];
        if (transportRules.length === 0 && transportChecklists.length === 0) {
            return null;
        }
        const rulesText = transportRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            return `- ${message}`;
        })
            .join('\n');
        const checklistText = transportChecklists
            .flatMap((checklist) => checklist.items || [])
            .filter((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return itemText.toLowerCase().match(/(transport|bus|taxi|car|ferry|public transport|rental)/i);
        })
            .map((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return `  • ${itemText}`;
        })
            .join('\n');
        const text = `${countryName} 当地交通:\n${rulesText}${checklistText ? `\n\n交通相关检查:\n${checklistText}` : ''}`;
        return {
            key: `COUNTRY_TRANSPORT_${countryCode}`,
            type: 'COUNTRY_TRANSPORT',
            text,
            priority: 65,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
        };
    }
    extractBookingNormsBlock(packData, countryCode, countryName) {
        var _a, _b;
        const bookingRules = ((_a = packData.rules) === null || _a === void 0 ? void 0 : _a.filter((rule) => {
            var _a, _b, _c, _d;
            return rule.category === 'activities_bookings' ||
                ((_a = rule.id) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('booking')) ||
                ((_b = rule.id) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('reservation')) ||
                ((_d = (_c = rule.then) === null || _c === void 0 ? void 0 : _c.tasks) === null || _d === void 0 ? void 0 : _d.some((task) => { var _a; return (_a = task.tags) === null || _a === void 0 ? void 0 : _a.includes('booking'); }));
        })) || [];
        const bookingChecklists = ((_b = packData.checklists) === null || _b === void 0 ? void 0 : _b.filter((checklist) => {
            var _a;
            return checklist.category === 'activities_bookings' ||
                ((_a = checklist.items) === null || _a === void 0 ? void 0 : _a.some((item) => {
                    const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
                    return itemText.toLowerCase().match(/(booking|reservation|book|advance)/i);
                }));
        })) || [];
        if (bookingRules.length === 0 && bookingChecklists.length === 0) {
            return null;
        }
        const bookingTasks = bookingRules
            .flatMap((rule) => { var _a; return ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.tasks) || []; })
            .filter((task) => {
            var _a, _b, _c;
            return ((_a = task.tags) === null || _a === void 0 ? void 0 : _a.includes('booking')) ||
                ((_b = task.title) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('book')) ||
                ((_c = task.title) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes('reservation'));
        })
            .map((task) => {
            var _a, _b;
            const title = typeof task.title === 'string' ? task.title : ((_a = task.title) === null || _a === void 0 ? void 0 : _a.en) || ((_b = task.title) === null || _b === void 0 ? void 0 : _b.zh) || '';
            const dueText = task.dueOffsetDays
                ? ` (提前 ${Math.abs(task.dueOffsetDays)} 天)`
                : '';
            return `  • ${title}${dueText}`;
        })
            .join('\n');
        const rulesText = bookingRules
            .map((rule) => {
            var _a, _b, _c, _d, _e;
            const message = typeof ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === 'string'
                ? rule.then.message
                : ((_c = (_b = rule.then) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.en) || ((_e = (_d = rule.then) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.zh) || '';
            return `- ${message}`;
        })
            .join('\n');
        const checklistText = bookingChecklists
            .flatMap((checklist) => checklist.items || [])
            .filter((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return itemText.toLowerCase().match(/(booking|reservation|book|advance)/i);
        })
            .map((item) => {
            const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
            return `  • ${itemText}`;
        })
            .join('\n');
        const parts = [rulesText];
        if (bookingTasks)
            parts.push(`\n预订任务:\n${bookingTasks}`);
        if (checklistText)
            parts.push(`\n预订检查清单:\n${checklistText}`);
        const text = `${countryName} 预订规范:\n${parts.join('\n')}`;
        return {
            key: `COUNTRY_BOOKING_${countryCode}`,
            type: 'COUNTRY_BOOKING',
            text,
            priority: 60,
            visibility: 'public',
            provenance: {
                source: 'pack',
                identifier: `countryPack:${countryCode}`,
                version: packData.version,
                timestamp: packData.lastReviewedAt || new Date().toISOString(),
            },
            data: {
                rulesCount: bookingRules.length,
                tasksCount: bookingRules.flatMap((r) => { var _a; return ((_a = r.then) === null || _a === void 0 ? void 0 : _a.tasks) || []; }).length,
            },
        };
    }
};
exports.CountryPackGetBlocksSkill = CountryPackGetBlocksSkill;
exports.CountryPackGetBlocksSkill = CountryPackGetBlocksSkill = CountryPackGetBlocksSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        pack_storage_service_1.PackStorageService])
], CountryPackGetBlocksSkill);
//# sourceMappingURL=country-pack-get-blocks.skill.js.map