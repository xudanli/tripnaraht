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
var ReadinessCheckVisaWindowSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessCheckVisaWindowSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pack_storage_service_1 = require("../../trips/readiness/storage/pack-storage.service");
const exa_integration_service_1 = require("../../mcp/exa-integration.service");
let ReadinessCheckVisaWindowSkill = ReadinessCheckVisaWindowSkill_1 = class ReadinessCheckVisaWindowSkill {
    constructor(prisma, packStorage, exaIntegration) {
        this.prisma = prisma;
        this.packStorage = packStorage;
        this.exaIntegration = exaIntegration;
        this.logger = new common_1.Logger(ReadinessCheckVisaWindowSkill_1.name);
        this.metadata = {
            name: 'readiness.checkVisaWindow',
            description: '检查签证和入境时间窗风险，提供准备建议和特殊规则',
            version: '1.0.0',
            category: 'readiness',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 readiness.checkVisaWindow: destination=${input.tripMeta.destinationCountryCode}, ` +
            `nationality=${input.tripMeta.nationality || 'CN'}`);
        try {
            const { departureCountryCode, destinationCountryCode, departureDate, returnDate, nationality = 'CN' } = input.tripMeta;
            const departure = new Date(departureDate);
            const returnDateObj = new Date(returnDate);
            const stayDays = Math.ceil((returnDateObj.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24));
            let visaInfo = null;
            try {
                const packs = await this.packStorage.findPacksByCountry(destinationCountryCode);
                const pack = packs === null || packs === void 0 ? void 0 : packs[0];
                if (pack === null || pack === void 0 ? void 0 : pack.rules) {
                    const visaRules = pack.rules.filter((r) => r.category === 'entry_transit');
                    if (visaRules.length > 0) {
                        visaInfo = this.extractVisaInfoFromRules(visaRules, nationality);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`无法获取 Readiness Pack，使用默认逻辑: ${error}`);
            }
            let realTimeVisaInfo = null;
            if (this.exaIntegration) {
                try {
                    const year = new Date(departure).getFullYear();
                    const month = departure.getMonth() + 1;
                    const query = `${destinationCountryCode} ${nationality}护照 ${year}年 签证政策 入境要求`;
                    const searchResult = await this.exaIntegration.searchRealTimeRisks(destinationCountryCode, `签证政策查询`, month, year);
                    if (searchResult.hasRisk === false) {
                        const visaQuery = `${destinationCountryCode} ${nationality}护照 ${year}年 签证 免签 电子签`;
                        const visaSearchResult = await this.exaIntegration.searchRealTimeRisks(destinationCountryCode, visaQuery, month, year);
                        if (visaSearchResult) {
                            realTimeVisaInfo = {
                                source: 'EXA_REALTIME',
                                description: visaSearchResult.riskDescription || '',
                            };
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`Exa visa policy search failed: ${error.message}，继续使用结构化数据`);
                }
            }
            const visaStatus = this.determineVisaStatus(destinationCountryCode, nationality, stayDays, realTimeVisaInfo || visaInfo);
            const visaRiskLevel = this.assessRiskLevel(visaStatus, departure, stayDays);
            const recommendedLeadTime = this.calculateRecommendedLeadTime(visaStatus, visaRiskLevel);
            const specialRules = this.extractSpecialRules(destinationCountryCode, nationality, visaStatus);
            return {
                visaRiskLevel,
                recommendedLeadTime,
                specialRules,
                visaStatus,
            };
        }
        catch (error) {
            this.logger.error(`检查签证时间窗失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    determineVisaStatus(destinationCountryCode, nationality, stayDays, visaInfo) {
        if (nationality === 'CN' || nationality === 'CHN') {
            const schengenCountries = [
                'AT', 'BE', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
                'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
                'PT', 'SK', 'SI', 'ES', 'SE', 'CH'
            ];
            if (schengenCountries.includes(destinationCountryCode)) {
                return {
                    required: true,
                    type: 'SCHENGEN',
                    allowedStay: '90天内180天',
                    processingTime: '15-30个工作日',
                };
            }
            const visaFreeCountries = {
                'SG': '30天',
                'MY': '30天',
                'TH': '30天',
                'JP': '15天',
                'KR': '30天',
            };
            if (visaFreeCountries[destinationCountryCode]) {
                return {
                    required: false,
                    type: 'VISA_FREE',
                    allowedStay: visaFreeCountries[destinationCountryCode],
                };
            }
            const evisaCountries = {
                'AU': '电子签',
                'NZ': '电子签',
                'TR': '电子签',
            };
            if (evisaCountries[destinationCountryCode]) {
                return {
                    required: true,
                    type: 'EVISA',
                    processingTime: '3-7个工作日',
                };
            }
        }
        return {
            required: true,
            type: 'VISA_REQUIRED',
            processingTime: '15-30个工作日',
        };
    }
    assessRiskLevel(visaStatus, departureDate, stayDays) {
        if (!(visaStatus === null || visaStatus === void 0 ? void 0 : visaStatus.required)) {
            return 'none';
        }
        const daysUntilDeparture = Math.ceil((departureDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const processingDays = this.parseProcessingTime(visaStatus.processingTime || '30个工作日');
        const recommendedDays = processingDays * 1.5;
        if (daysUntilDeparture < recommendedDays * 0.5) {
            return 'high';
        }
        else if (daysUntilDeparture < recommendedDays) {
            return 'medium';
        }
        else {
            return 'low';
        }
    }
    parseProcessingTime(timeStr) {
        const match = timeStr.match(/(\d+)-?(\d+)?/);
        if (match) {
            const min = parseInt(match[1], 10);
            const max = match[2] ? parseInt(match[2], 10) : min;
            return Math.ceil((min + max) / 2);
        }
        return 30;
    }
    calculateRecommendedLeadTime(visaStatus, riskLevel) {
        if (!(visaStatus === null || visaStatus === void 0 ? void 0 : visaStatus.required)) {
            return 0;
        }
        const processingDays = this.parseProcessingTime(visaStatus.processingTime || '30个工作日');
        switch (riskLevel) {
            case 'high':
                return Math.max(60, processingDays * 2);
            case 'medium':
                return Math.max(45, processingDays * 1.5);
            case 'low':
                return processingDays + 7;
            default:
                return processingDays;
        }
    }
    extractSpecialRules(destinationCountryCode, nationality, visaStatus) {
        const rules = [];
        if ((visaStatus === null || visaStatus === void 0 ? void 0 : visaStatus.type) === 'SCHENGEN') {
            rules.push({
                rule: '申根签证规则',
                description: '申根签证适用于所有申根区国家，首次入境必须在签发国',
                actionRequired: true,
            });
            rules.push({
                rule: '停留时间限制',
                description: '每180天内在申根区停留不超过90天',
                actionRequired: true,
            });
        }
        if ((visaStatus === null || visaStatus === void 0 ? void 0 : visaStatus.type) === 'VISA_FREE' && visaStatus.allowedStay) {
            rules.push({
                rule: '免签停留限制',
                description: `免签停留期：${visaStatus.allowedStay}，超期需申请签证`,
                actionRequired: false,
            });
        }
        if ((visaStatus === null || visaStatus === void 0 ? void 0 : visaStatus.type) === 'EVISA') {
            rules.push({
                rule: '电子签要求',
                description: '需要提前在线申请电子签证，获批后打印携带',
                actionRequired: true,
            });
        }
        return rules;
    }
    extractVisaInfoFromRules(rules, nationality) {
        var _a, _b, _c, _d;
        for (const rule of rules) {
            if (((_b = (_a = rule.then) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.includes('签证')) || ((_d = (_c = rule.then) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.includes('visa'))) {
                return {
                    required: true,
                    message: rule.then.message,
                };
            }
        }
        return null;
    }
};
exports.ReadinessCheckVisaWindowSkill = ReadinessCheckVisaWindowSkill;
exports.ReadinessCheckVisaWindowSkill = ReadinessCheckVisaWindowSkill = ReadinessCheckVisaWindowSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        pack_storage_service_1.PackStorageService,
        exa_integration_service_1.ExaIntegrationService])
], ReadinessCheckVisaWindowSkill);
//# sourceMappingURL=readiness-check-visa-window.skill.js.map