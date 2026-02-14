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
var ClaudeComplianceAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeComplianceAgentService = void 0;
const common_1 = require("@nestjs/common");
const compliance_plugin_service_1 = require("../../../route-directions/plugins/compliance-plugin.service");
const compliance_facts_agent_service_1 = require("../../../rag/services/compliance-facts-agent.service");
const iceland_comprehensive_service_1 = require("../../../data-contracts/services/iceland-comprehensive.service");
let ClaudeComplianceAgentService = ClaudeComplianceAgentService_1 = class ClaudeComplianceAgentService {
    constructor(compliancePlugin, complianceFactsAgent, icelandComprehensive) {
        this.compliancePlugin = compliancePlugin;
        this.complianceFactsAgent = complianceFactsAgent;
        this.icelandComprehensive = icelandComprehensive;
        this.logger = new common_1.Logger(ClaudeComplianceAgentService_1.name);
        this.logger.log(`[ClaudeComplianceAgent] 已初始化`);
        this.logger.log(`[ClaudeComplianceAgent] CompliancePlugin: ${!!this.compliancePlugin}, ComplianceFactsAgent: ${!!this.complianceFactsAgent}, IcelandComprehensive: ${!!this.icelandComprehensive}`);
    }
    async checkCompliance(itinerary, gateResult, context) {
        this.logger.debug(`[ClaudeComplianceAgent] 检查合规性: request_id=${context.request_id}`);
        try {
            const risk_warnings = [];
            const disclaimers = [];
            const required_confirmations = [];
            if (gateResult.violations) {
                for (const violation of gateResult.violations) {
                    if (violation.type === 'SAFETY' && violation.severity === 'HARD') {
                        risk_warnings.push({
                            level: 'CRITICAL',
                            category: 'SAFETY',
                            message: violation.detail,
                            requires_user_confirmation: true,
                        });
                    }
                    else if (violation.type === 'SAFETY' && violation.severity === 'SOFT') {
                        risk_warnings.push({
                            level: 'HIGH',
                            category: 'SAFETY',
                            message: violation.detail,
                            requires_user_confirmation: true,
                        });
                    }
                }
            }
            if (this.icelandComprehensive && itinerary.days.length > 0) {
            }
            if (gateResult.gate_result === 'ADJUST_REQUIRED' || gateResult.gate_result === 'NEED_USER_CONFIRM') {
                disclaimers.push('部分行程信息可能未完全核验，实际交通班次、票价、开放时间请以官方信息为准。建议用户在出行前再次确认。');
            }
            if (risk_warnings.some(w => w.level === 'CRITICAL' || w.level === 'HIGH')) {
                disclaimers.push('本行程涉及户外活动，可能存在以下风险：天气变化、地形复杂、意外伤害等。用户需自行评估自身能力，并承担相应风险。TripNARA不对因使用本行程而产生的任何损失承担责任。');
                required_confirmations.push('我已了解并接受行程中的风险');
            }
            if (this.compliancePlugin) {
            }
            return {
                risk_warnings,
                disclaimers,
                required_confirmations,
            };
        }
        catch (error) {
            this.logger.error(`[ClaudeComplianceAgent] 合规检查失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                risk_warnings: [{
                        level: 'MEDIUM',
                        category: 'SAFETY',
                        message: '合规检查服务不可用，请谨慎使用行程信息',
                        requires_user_confirmation: false,
                    }],
                disclaimers: ['部分信息可能未完全核验，请以官方信息为准'],
                required_confirmations: [],
            };
        }
    }
};
exports.ClaudeComplianceAgentService = ClaudeComplianceAgentService;
exports.ClaudeComplianceAgentService = ClaudeComplianceAgentService = ClaudeComplianceAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [compliance_plugin_service_1.CompliancePluginService,
        compliance_facts_agent_service_1.ComplianceFactsAgent,
        iceland_comprehensive_service_1.IcelandComprehensiveService])
], ClaudeComplianceAgentService);
//# sourceMappingURL=compliance-agent.service.js.map