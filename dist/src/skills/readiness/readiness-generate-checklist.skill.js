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
var ReadinessGenerateChecklistSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessGenerateChecklistSkill = void 0;
const common_1 = require("@nestjs/common");
const readiness_agent_service_1 = require("../../trips/decision/readiness/readiness-agent.service");
let ReadinessGenerateChecklistSkill = ReadinessGenerateChecklistSkill_1 = class ReadinessGenerateChecklistSkill {
    constructor(readinessAgent) {
        this.readinessAgent = readinessAgent;
        this.logger = new common_1.Logger(ReadinessGenerateChecklistSkill_1.name);
        this.metadata = {
            name: 'readiness.generateChecklist',
            description: '基于世界模型和路线方向生成行前准备清单（证件、装备、健康、技能等）',
            version: '1.0.0',
            category: 'readiness',
            inputSchema: {
                dependencies: [
                    { param: 'world', alternatives: ['tripId'] },
                    { param: 'tripId', alternatives: ['world'] },
                ],
                extractors: {
                    tripId: 'tripId',
                },
            },
        };
    }
    async execute(input) {
        var _a, _b, _c;
        this.logger.debug(`执行 readiness.generateChecklist`);
        const plan = input.plan || {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            days: [],
        };
        const result = this.readinessAgent.run(input.world, plan);
        return {
            items: result.items.map(item => {
                var _a;
                return ({
                    type: item.type,
                    severity: item.severity,
                    title: item.title,
                    description: item.description || '',
                    reason: ((_a = item.reasonSignals) === null || _a === void 0 ? void 0 : _a.join(', ')) || '',
                });
            }),
            itemsByType: {
                GEAR: result.itemsByType.GEAR || [],
                DOCUMENT: result.itemsByType.DOCUMENT || [],
                HEALTH: result.itemsByType.HEALTH || [],
                SKILL: result.itemsByType.SKILL || [],
            },
            itemsBySeverity: {
                MUST: result.itemsBySeverity.MUST || [],
                SHOULD: result.itemsBySeverity.SHOULD || [],
                OPTIONAL: result.itemsBySeverity.OPTIONAL || [],
            },
            summary: {
                totalItems: result.items.length,
                mustItems: ((_a = result.itemsBySeverity.MUST) === null || _a === void 0 ? void 0 : _a.length) || 0,
                shouldItems: ((_b = result.itemsBySeverity.SHOULD) === null || _b === void 0 ? void 0 : _b.length) || 0,
                optionalItems: ((_c = result.itemsBySeverity.OPTIONAL) === null || _c === void 0 ? void 0 : _c.length) || 0,
            },
        };
    }
};
exports.ReadinessGenerateChecklistSkill = ReadinessGenerateChecklistSkill;
exports.ReadinessGenerateChecklistSkill = ReadinessGenerateChecklistSkill = ReadinessGenerateChecklistSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [readiness_agent_service_1.ReadinessAgentService])
], ReadinessGenerateChecklistSkill);
//# sourceMappingURL=readiness-generate-checklist.skill.js.map