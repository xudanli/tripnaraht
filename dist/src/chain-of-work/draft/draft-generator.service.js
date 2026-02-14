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
var DraftGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../llm/services/llm.service");
const llm_request_dto_1 = require("../../llm/dto/llm-request.dto");
const skills_registry_service_1 = require("../../skills/services/skills-registry.service");
const draft_generation_prompt_1 = require("./prompts/draft-generation.prompt");
let DraftGeneratorService = DraftGeneratorService_1 = class DraftGeneratorService {
    constructor(llmService, skillsRegistry) {
        this.llmService = llmService;
        this.skillsRegistry = skillsRegistry;
        this.logger = new common_1.Logger(DraftGeneratorService_1.name);
    }
    async generateDraft(request, config) {
        var _a;
        this.logger.log(`[DraftGenerator] 开始生成步骤草案: request_id=${request.request_id}`);
        const startTime = Date.now();
        try {
            const availableSkills = this.skillsRegistry.getAllSkills();
            const prompt = (0, draft_generation_prompt_1.buildDraftGenerationPrompt)(request, availableSkills);
            const provider = this.mapModelToProvider((config === null || config === void 0 ? void 0 : config.model) || 'claude-3-5-sonnet');
            const schema = this.getDraftGenerationSchema();
            let draft;
            try {
                this.logger.debug(`[DraftGenerator] 调用 LLM 生成步骤草案: provider=${provider}, prompt_length=${prompt.length}`);
                const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
                const draftData = this.extractJSON(response);
                this.logger.debug(`[DraftGenerator] LLM 响应解析成功: steps_count=${((_a = draftData.steps) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
                draft = this.parseDraft(draftData, request);
                this.logger.debug(`[DraftGenerator] LLM 生成成功，解析了 ${draft.steps.length} 个步骤`);
                const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'];
                const missingSteps = requiredSteps.filter(step => !draft.steps.some(s => s.step_type === step));
                if (missingSteps.length > 0) {
                    this.logger.warn(`[DraftGenerator] LLM 生成缺少步骤: ${missingSteps.join(', ')}，使用完整模板`);
                    draft = this.generateTemplateDraft(request);
                }
            }
            catch (llmError) {
                this.logger.warn(`[DraftGenerator] LLM 生成失败，使用模板化步骤草案: ${llmError.message}`, llmError.stack);
                draft = this.generateTemplateDraft(request);
            }
            const duration = Date.now() - startTime;
            this.logger.log(`[DraftGenerator] 步骤草案生成完成: duration=${duration}ms, steps=${draft.steps.length}`);
            return draft;
        }
        catch (error) {
            this.logger.error(`[DraftGenerator] 步骤草案生成失败: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
    mapModelToProvider(model) {
        if (model.includes('claude') || model.includes('anthropic')) {
            return llm_request_dto_1.LlmProvider.ANTHROPIC;
        }
        else if (model.includes('gpt') || model.includes('openai')) {
            return llm_request_dto_1.LlmProvider.OPENAI;
        }
        else if (model.includes('deepseek')) {
            return llm_request_dto_1.LlmProvider.DEEPSEEK;
        }
        else if (model.includes('gemini')) {
            return llm_request_dto_1.LlmProvider.GEMINI;
        }
        return llm_request_dto_1.LlmProvider.ANTHROPIC;
    }
    extractJSON(response) {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        return JSON.parse(cleaned);
    }
    parseDraft(draftData, request) {
        const now = new Date().toISOString();
        const steps = (draftData.steps || []).map((stepData, index) => ({
            id: stepData.id || `step-${index + 1}`,
            step_type: stepData.step_type || this.inferStepType(stepData.title || stepData.description),
            title: stepData.title || stepData.step_type || `步骤 ${index + 1}`,
            description: stepData.description || '',
            status: 'draft',
            priority: stepData.priority || 10 - index,
            conditions: stepData.conditions,
            version: 1,
            created_at: now,
            updated_at: now,
        }));
        const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'];
        const existingStepTypes = steps.map(s => s.step_type);
        const templateDraft = this.generateTemplateDraft(request);
        for (const requiredStep of requiredSteps) {
            if (!existingStepTypes.includes(requiredStep)) {
                const templateStep = templateDraft.steps.find(s => s.step_type === requiredStep);
                if (templateStep) {
                    steps.push(templateStep);
                }
            }
        }
        const stepOrder = {
            'INTAKE': 1,
            'RESEARCH': 2,
            'GATE_EVAL': 3,
            'PLAN_GEN': 4,
            'VERIFY': 5,
            'REPAIR': 6,
            'NARRATE': 7,
            'DONE': 8,
        };
        steps.sort((a, b) => (stepOrder[a.step_type] || 99) - (stepOrder[b.step_type] || 99));
        const gateEvalIndex = steps.findIndex(s => s.step_type === 'GATE_EVAL');
        const planGenIndex = steps.findIndex(s => s.step_type === 'PLAN_GEN');
        if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex >= planGenIndex) {
            this.logger.warn(`[DraftGenerator] 步骤顺序错误：GATE_EVAL (${gateEvalIndex}) >= PLAN_GEN (${planGenIndex})，已自动修正`);
            const gateStep = steps[gateEvalIndex];
            steps[gateEvalIndex] = steps[planGenIndex];
            steps[planGenIndex] = gateStep;
        }
        return {
            draft_id: `draft-${request.request_id}`,
            workflow_id: request.request_id,
            version: 'v1.0',
            steps,
            orchestration_mode: 'CLAUDE_SM',
            trip_plan_request: request,
            metadata: {
                step_count: steps.length,
                skills_count: steps.filter(s => s.skills && s.skills.length > 0).length,
                sub_agents_count: steps.filter(s => s.sub_agent).length,
                last_modified: now,
                created_by: 'system',
            },
            created_at: now,
            updated_at: now,
        };
    }
    inferStepType(text) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('intake') || lowerText.includes('解析') || lowerText.includes('识别')) {
            return 'INTAKE';
        }
        else if (lowerText.includes('research') || lowerText.includes('收集') || lowerText.includes('获取')) {
            return 'RESEARCH';
        }
        else if (lowerText.includes('gate') || lowerText.includes('门控') || lowerText.includes('决策')) {
            return 'GATE_EVAL';
        }
        else if (lowerText.includes('plan') || lowerText.includes('生成') || lowerText.includes('行程')) {
            return 'PLAN_GEN';
        }
        else if (lowerText.includes('verify') || lowerText.includes('验证') || lowerText.includes('检查')) {
            return 'VERIFY';
        }
        else if (lowerText.includes('repair') || lowerText.includes('修复') || lowerText.includes('调整')) {
            return 'REPAIR';
        }
        else if (lowerText.includes('narrate') || lowerText.includes('解释') || lowerText.includes('说明')) {
            return 'NARRATE';
        }
        else if (lowerText.includes('done') || lowerText.includes('完成')) {
            return 'DONE';
        }
        return 'INTAKE';
    }
    getDraftGenerationSchema() {
        return {
            type: 'object',
            properties: {
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            step_type: {
                                type: 'string',
                                enum: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'],
                            },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            priority: { type: 'number', minimum: 1, maximum: 10 },
                            skills: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                        },
                        required: ['id', 'step_type', 'title', 'description'],
                    },
                },
            },
            required: ['steps'],
        };
    }
    generateTemplateDraft(request) {
        const now = new Date().toISOString();
        const steps = [
            {
                id: 'step-intake',
                step_type: 'INTAKE',
                title: '解析用户需求',
                description: '解析用户的旅行需求，提取关键信息（起点、终点、日期、交通方式、人员配置、约束条件等），识别信息缺口，为后续 RESEARCH 步骤做准备',
                status: 'draft',
                priority: 10,
                version: 1,
                sub_agent: 'Planner',
                skills: ['需求解析', '缺口识别'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-research',
                step_type: 'RESEARCH',
                title: '收集硬数据',
                description: '调用 Domain Agents 获取完整的决策所需数据，包括交通路线、POI信息、开放时间、地形高程、天气、风险区域等硬数据',
                status: 'draft',
                priority: 9,
                version: 1,
                domain_agents: ['GeoAgent', 'WeatherAgent', 'CostAgent', 'ExperienceAgent'],
                skills: ['路线规划', '天气预报查询', 'POI搜索', '费用估算', '体验评估'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-gate-eval',
                step_type: 'GATE_EVAL',
                title: '执行 Should-Exist Gate 决策',
                description: '基于收集的硬数据，执行三人格策略编排（Abu安全检查 → Dr.Dre节奏评估 → Neptune空间修复），判断行程方案是否应该存在，输出 GateResult（ALLOW/BLOCK/ADJUST_REQUIRED/NEED_USER_CONFIRM）',
                status: 'draft',
                priority: 10,
                version: 1,
                sub_agent: 'Gatekeeper',
                guardian: 'ABU',
                skills: ['门控评估', '安全检查'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-plan-gen',
                step_type: 'PLAN_GEN',
                title: '生成结构化行程草案',
                description: '仅在 Gate 结果为 ALLOW 或 ADJUST_REQUIRED 时执行。生成 Plan A（最优体验）、Plan B（稳妥方案）、Plan C（保底方案），每个方案包含时间窗、地点、可达性证据、疲劳评分和风险概率',
                status: 'draft',
                priority: 8,
                version: 1,
                sub_agent: 'Planner',
                conditions: '仅在 gate_result = ALLOW 或 ADJUST_REQUIRED 时执行',
                skills: ['行程规划', '多方案生成'],
                outputs: ['plan_a', 'plan_b', 'plan_c'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-verify',
                step_type: 'VERIFY',
                title: '验证行程可执行性',
                description: '对生成的行程草案进行完整验证，检查开放时间冲突、换乘buffer充足性、可达性、疲劳阈值、天气风险等，输出验证结果和冲突列表',
                status: 'draft',
                priority: 7,
                version: 1,
                sub_agent: 'CoreDecision',
                guardian: 'DR_DRE',
                skills: ['可行性验证', '节奏评估', '冲突检测'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-compliance',
                step_type: 'COMPLIANCE',
                title: '风险分类与合规检查',
                description: '执行风险分类（高/中/低）、合规检查（签证、保险、健康要求）、免责声明生成，确保所有风险点都有明确的用户知情确认',
                status: 'draft',
                priority: 6,
                version: 1,
                sub_agent: 'Compliance',
                skills: ['风险分类', '合规检查', '免责留痕'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-repair',
                step_type: 'REPAIR',
                title: '修复不可执行问题',
                description: '仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行。根据验证结果，执行修复方案：替换不可用的POI、调整路线、增加缓冲时间、更换交通方式或降级难度，保持路线哲学不变',
                status: 'draft',
                priority: 5,
                version: 1,
                sub_agent: 'LocalInsight',
                guardian: 'NEPTUNE',
                conditions: '仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行',
                skills: ['空间修复', '替代方案', '路线调整'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-narrate',
                step_type: 'NARRATE',
                title: '生成用户可读解释',
                description: '将技术性的决策日志和行程数据转换为用户可读的解释，包括三人格的工作说明、关键风险点、取舍决策、行前准备建议等，不修改任何硬字段',
                status: 'draft',
                priority: 4,
                version: 1,
                sub_agent: 'Narrator',
                skills: ['解释生成', '决策可视化'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-feedback',
                step_type: 'FEEDBACK',
                title: 'RLHF 信号采集',
                description: '收集用户反馈信号（方案选择、修改偏好、执行偏差），用于决策质量自学习和风格建模',
                status: 'draft',
                priority: 3,
                version: 1,
                sub_agent: 'CoreDecision',
                skills: ['信号采集', '偏差分析', 'RLHF反馈'],
                created_at: now,
                updated_at: now,
            },
            {
                id: 'step-done',
                step_type: 'DONE',
                title: '完成',
                description: '规划流程完成，输出最终结果包括结构化行程、用户解释、决策日志和行前准备清单',
                status: 'draft',
                priority: 1,
                version: 1,
                outputs: ['itinerary', 'explanation', 'decision_log', 'preparation_checklist'],
                created_at: now,
                updated_at: now,
            },
        ];
        return {
            draft_id: `draft-${request.request_id}`,
            workflow_id: request.request_id,
            version: 'v1.0',
            steps,
            orchestration_mode: 'CLAUDE_SM',
            trip_plan_request: request,
            metadata: {
                step_count: steps.length,
                skills_count: steps.reduce((sum, s) => { var _a; return sum + (((_a = s.skills) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0),
                sub_agents_count: steps.filter(s => s.sub_agent).length,
                last_modified: now,
                created_by: 'system',
            },
            created_at: now,
            updated_at: now,
        };
    }
};
exports.DraftGeneratorService = DraftGeneratorService;
exports.DraftGeneratorService = DraftGeneratorService = DraftGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        skills_registry_service_1.SkillsRegistryService])
], DraftGeneratorService);
//# sourceMappingURL=draft-generator.service.js.map