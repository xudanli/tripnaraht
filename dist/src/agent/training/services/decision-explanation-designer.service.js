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
var DecisionExplanationDesignerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionExplanationDesignerService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let DecisionExplanationDesignerService = DecisionExplanationDesignerService_1 = class DecisionExplanationDesignerService {
    constructor() {
        this.logger = new common_1.Logger(DecisionExplanationDesignerService_1.name);
        this.designs = new Map();
        this.initializeDesigns();
    }
    getDesign(designId) {
        if (designId) {
            return this.designs.get(designId) || null;
        }
        return Array.from(this.designs.values())[0] || null;
    }
    createDesign(design) {
        const fullDesign = {
            ...design,
            design_id: `design_${(0, crypto_1.randomUUID)()}`,
        };
        this.designs.set(fullDesign.design_id, fullDesign);
        this.logger.log(`[DecisionExplanationDesigner] 创建UI设计: designId=${fullDesign.design_id}`);
        return fullDesign;
    }
    initializeDesigns() {
        this.createDesign({
            information_hierarchy: {
                level_1_summary: '决策摘要（1-2句话，核心决策和结果）',
                level_2_process: '决策过程（关键步骤和推理）',
                level_3_evidence: '详细证据（证据链、数据来源）',
            },
            visualization_formats: [
                {
                    type: 'DECISION_TREE',
                    description: '决策树可视化，展示决策路径',
                    use_case: '复杂多步骤决策',
                },
                {
                    type: 'EVIDENCE_GRAPH',
                    description: '证据图，展示证据之间的关系',
                    use_case: '需要展示证据链',
                },
                {
                    type: 'TIMELINE',
                    description: '时间线，展示决策的时间顺序',
                    use_case: '需要展示决策时间线',
                },
            ],
            user_friendly_format: {
                summary_length: 200,
                detail_expandable: true,
                evidence_collapsible: true,
            },
        });
    }
    listDesigns() {
        return Array.from(this.designs.values());
    }
};
exports.DecisionExplanationDesignerService = DecisionExplanationDesignerService;
exports.DecisionExplanationDesignerService = DecisionExplanationDesignerService = DecisionExplanationDesignerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DecisionExplanationDesignerService);
//# sourceMappingURL=decision-explanation-designer.service.js.map