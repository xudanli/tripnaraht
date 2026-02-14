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
var PlanArchitectGenerateSkeletonSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanArchitectGenerateSkeletonSkill = void 0;
const common_1 = require("@nestjs/common");
const world_build_context_skill_1 = require("../../world/world-build-context.skill");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
const places_service_1 = require("../../../places/places.service");
const prisma_service_1 = require("../../../prisma/prisma.service");
let PlanArchitectGenerateSkeletonSkill = PlanArchitectGenerateSkeletonSkill_1 = class PlanArchitectGenerateSkeletonSkill {
    constructor(llmService, worldBuildContext, placesService, prisma) {
        this.llmService = llmService;
        this.worldBuildContext = worldBuildContext;
        this.placesService = placesService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(PlanArchitectGenerateSkeletonSkill_1.name);
        this.metadata = {
            name: 'plan.architect.generateSkeleton',
            description: '从目标与约束生成 2-3 套行程骨架方案（紧凑/均衡/松弛），包含每天主题、锚点、移动日和取舍理由',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a, _b, _c, _d, _e;
        this.logger.debug(`执行 plan.architect.generateSkeleton: destination=${input.context.destination.city || input.context.destination.country}, days=${input.context.days}`);
        try {
            let world = input.world;
            if (!world && input.tripId && this.worldBuildContext) {
                const worldResult = await this.worldBuildContext.execute({ tripId: input.tripId });
                world = worldResult.world;
            }
            const userPrompt = this.buildPrompt(input.context, world);
            const fullPrompt = `你是一位经验丰富的旅行规划师（Trip Architect）。你的任务是基于用户的目标和约束，生成 2-3 套不同的行程骨架方案。

每套方案必须包含：
1. 每天的主题和描述（description 请控制在 50 字以内）
2. 关键锚点（必须去的城市/活动）
3. 移动日安排
4. 清晰的取舍理由（tradeoffs/strengths/weaknesses 每个条目控制在 30 字以内）

方案类型：
- 紧凑型：最大化体验密度，适合时间有限但想多看多体验的用户
- 均衡型：平衡体验和休息，适合大多数用户
- 松弛型：节奏较慢，适合注重深度体验和休息的用户

【重要】输出要求：
1. 必须返回完整的 JSON 对象，不要被截断
2. 只返回 JSON，不要包含 markdown 代码块标记（\`\`\`json）
3. 确保所有数组和对象都正确关闭
4. 如果内容较长，请保持描述简洁以确保 JSON 完整

${userPrompt}`;
            const schema = {
                type: 'object',
                properties: {
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                                dayThemes: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            day: { type: 'number' },
                                            theme: { type: 'string' },
                                            description: { type: 'string' },
                                        },
                                        required: ['day', 'theme'],
                                    },
                                },
                                anchors: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            day: { type: 'number' },
                                            location: { type: 'string' },
                                            activity: { type: 'string' },
                                            priority: { type: 'string', enum: ['anchor', 'core', 'optional'] },
                                        },
                                        required: ['day', 'location', 'activity', 'priority'],
                                    },
                                },
                                transferDays: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            day: { type: 'number' },
                                            from: { type: 'string' },
                                            to: { type: 'string' },
                                            mode: { type: 'string' },
                                        },
                                        required: ['day', 'from', 'to'],
                                    },
                                },
                                rationale: {
                                    type: 'object',
                                    properties: {
                                        philosophy: { type: 'string' },
                                        tradeoffs: { type: 'array', items: { type: 'string' } },
                                        strengths: { type: 'array', items: { type: 'string' } },
                                        weaknesses: { type: 'array', items: { type: 'string' } },
                                    },
                                    required: ['philosophy', 'tradeoffs', 'strengths', 'weaknesses'],
                                },
                            },
                            required: ['id', 'name', 'dayThemes', 'anchors', 'transferDays', 'rationale'],
                        },
                    },
                    recommendation: {
                        type: 'object',
                        properties: {
                            optionId: { type: 'string' },
                            reason: { type: 'string' },
                        },
                    },
                },
                required: ['options'],
            };
            const adjustedPrompt = input.context.days > 7
                ? fullPrompt + '\n\n【重要】请保持描述简洁，每个 dayTheme 的 description 不超过 50 字，rationale 的每个 tradeoff/strength/weakness 不超过 30 字。'
                : fullPrompt;
            const llmCallPromise = this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, adjustedPrompt, schema);
            const timeoutMs = input.context.days > 7 ? 90000 : 60000;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`LLM 调用超时（${timeoutMs / 1000}秒）`));
                }, timeoutMs);
            });
            let skeletonSetStr;
            try {
                skeletonSetStr = await Promise.race([llmCallPromise, timeoutPromise]);
            }
            catch (error) {
                const isTimeout = ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('超时')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('timeout'));
                if (isTimeout) {
                    this.logger.warn(`LLM 调用超时，使用默认方案: ${error.message}`);
                }
                else {
                    this.logger.error(`LLM 调用失败，使用默认方案: ${error.message}`);
                }
                return this.getDefaultSkeletonSet(input.context);
            }
            let skeletonSet;
            try {
                skeletonSet = this.extractJSON(skeletonSetStr);
            }
            catch (parseError) {
                this.logger.error(`解析 LLM 响应失败: ${parseError.message}, 响应: ${skeletonSetStr === null || skeletonSetStr === void 0 ? void 0 : skeletonSetStr.substring(0, 200)}`);
                return this.getDefaultSkeletonSet(input.context);
            }
            if (skeletonSet.options) {
                try {
                    this.logger.debug(`开始补充 POI 信息（${skeletonSet.options.length} 个骨架方案）`);
                    const poiStartTime = Date.now();
                    await this.enrichSkeletonWithPois(skeletonSet, input.context, input.tripId);
                    const poiDuration = Date.now() - poiStartTime;
                    this.logger.debug(`POI 补充完成，耗时 ${poiDuration}ms`);
                }
                catch (poiError) {
                    this.logger.warn(`补充 POI 信息失败: ${poiError.message}，继续返回骨架方案`, poiError.stack);
                }
            }
            if ((_d = (_c = input.context.constraints) === null || _c === void 0 ? void 0 : _c.time) === null || _d === void 0 ? void 0 : _d.startDate) {
                try {
                    const validationResult = this.validateSeasonalConstraints(skeletonSet, input.context.constraints.time.startDate, input.context.destination.country);
                    if (validationResult.warnings.length > 0) {
                        this.logger.warn(`季节性约束验证发现 ${validationResult.warnings.length} 个警告:`, validationResult.warnings);
                        for (const violation of validationResult.violations) {
                            const option = (_e = skeletonSet.options) === null || _e === void 0 ? void 0 : _e.find(opt => opt.id === violation.optionId);
                            if (option) {
                                const optionAny = option;
                                if (!optionAny.metadata) {
                                    optionAny.metadata = {};
                                }
                                if (!optionAny.metadata.seasonalWarnings) {
                                    optionAny.metadata.seasonalWarnings = [];
                                }
                                optionAny.metadata.seasonalWarnings.push({
                                    day: violation.day,
                                    location: violation.location,
                                    reason: violation.reason,
                                });
                                optionAny.metadata.seasonalValidation = {
                                    travelMonth: validationResult.travelMonth,
                                    isFRoadSeason: validationResult.isFRoadSeason,
                                };
                            }
                        }
                    }
                }
                catch (validationError) {
                    this.logger.warn(`季节性约束验证失败: ${validationError.message}，继续返回骨架方案`);
                }
            }
            return {
                skeletonSet,
                evidence: [],
            };
        }
        catch (error) {
            this.logger.error(`生成行程骨架失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    extractJSON(response) {
        if (!response || typeof response !== 'string') {
            throw new Error('响应为空或格式不正确');
        }
        let cleaned = response.trim();
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
        cleaned = cleaned.replace(/\n?\s*```$/i, '');
        cleaned = cleaned.trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }
        cleaned = cleaned.trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (parseError) {
            const fixedJson = this.tryFixIncompleteJSON(cleaned);
            if (fixedJson) {
                try {
                    this.logger.warn(`JSON 被截断，尝试修复后解析成功`);
                    return JSON.parse(fixedJson);
                }
                catch (retryError) {
                    this.logger.error(`修复后的 JSON 仍然无效: ${retryError.message}`);
                }
            }
            this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
            this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
            this.logger.error(`错误位置: ${parseError.message}`);
            throw parseError;
        }
    }
    tryFixIncompleteJSON(jsonStr) {
        try {
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;
            if (openBraces === closeBraces && openBrackets === closeBrackets) {
                return null;
            }
            let fixed = jsonStr;
            fixed = fixed.replace(/"[^"]*$/, '');
            fixed = fixed.replace(/:\s*$/, '');
            fixed = fixed.replace(/,\s*$/, '');
            for (let i = 0; i < openBrackets - closeBrackets; i++) {
                fixed += ']';
            }
            for (let i = 0; i < openBraces - closeBraces; i++) {
                fixed += '}';
            }
            if (fixed.includes('"options"') && fixed.includes('"id"')) {
                try {
                    JSON.parse(fixed);
                    return fixed;
                }
                catch {
                    return null;
                }
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    buildPrompt(context, world) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const parts = [];
        parts.push(`## 规划任务`);
        parts.push(`目的地: ${context.destination.city || context.destination.country || context.destination.region || '未指定'}`);
        parts.push(`天数: ${context.days} 天`);
        if ((_b = (_a = context.constraints) === null || _a === void 0 ? void 0 : _a.time) === null || _b === void 0 ? void 0 : _b.startDate) {
            const startDate = new Date(context.constraints.time.startDate);
            const endDate = context.constraints.time.endDate ? new Date(context.constraints.time.endDate) : null;
            const month = startDate.getMonth() + 1;
            const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
            if (endDate) {
                parts.push(`旅行日期: ${startDate.toLocaleDateString('zh-CN')} - ${endDate.toLocaleDateString('zh-CN')} (${monthNames[month - 1]})`);
            }
            else {
                parts.push(`旅行日期: ${startDate.toLocaleDateString('zh-CN')} (${monthNames[month - 1]})`);
            }
        }
        if (context.travelMode) {
            parts.push(`交通模式: ${context.travelMode}`);
        }
        if (context.mustDo && context.mustDo.length > 0) {
            parts.push(`必去: ${context.mustDo.join(', ')}`);
        }
        if (context.mustAvoid && context.mustAvoid.length > 0) {
            parts.push(`必避: ${context.mustAvoid.join(', ')}`);
        }
        if (context.constraints) {
            parts.push(`\n## 约束条件`);
            if ((_c = context.constraints.budget) === null || _c === void 0 ? void 0 : _c.total) {
                parts.push(`预算: ${context.constraints.budget.total} ${context.constraints.budget.currency || 'CNY'}`);
            }
            if ((_d = context.constraints.fitness) === null || _d === void 0 ? void 0 : _d.level) {
                parts.push(`体力水平: ${context.constraints.fitness.level}`);
            }
            if ((_e = context.constraints.accommodation) === null || _e === void 0 ? void 0 : _e.level) {
                parts.push(`住宿档位: ${context.constraints.accommodation.level}`);
            }
            if ((_f = context.constraints.time) === null || _f === void 0 ? void 0 : _f.availableHoursPerDay) {
                parts.push(`每天可用时间: ${context.constraints.time.availableHoursPerDay} 小时`);
            }
            if ((_g = context.constraints.companions) === null || _g === void 0 ? void 0 : _g.count) {
                parts.push(`同行人数: ${context.constraints.companions.count}`);
                if (context.constraints.companions.ages) {
                    parts.push(`年龄: ${context.constraints.companions.ages.join(', ')}`);
                }
            }
        }
        if ((_j = (_h = context.constraints) === null || _h === void 0 ? void 0 : _h.time) === null || _j === void 0 ? void 0 : _j.startDate) {
            const startDate = new Date(context.constraints.time.startDate);
            const month = startDate.getMonth() + 1;
            const countryCode = context.destination.country;
            const isIceland = countryCode === 'IS' || countryCode === '冰岛' || countryCode === 'Iceland';
            if (isIceland) {
                parts.push(`\n## ⚠️ 重要约束（冰岛季节性）`);
                if (month >= 6 && month <= 9) {
                    parts.push(`- ✅ 当前月份（${month}月）是F路和高地景点的开放季节`);
                    parts.push(`- ✅ F路（F-road）和高地景点（如Landmannalaugar、Þórsmörk）可达`);
                }
                else if (month >= 2 && month <= 5) {
                    parts.push(`- ⚠️ 当前月份（${month}月）部分F路关闭，高地景点可能不可达`);
                    parts.push(`- ❌ 请避免推荐需要F路到达的景点（如Landmannalaugar、Þórsmörk、高地徒步路线）`);
                    parts.push(`- ✅ 可以推荐：黄金圈、南岸、冰河湖、蓝湖等不需要F路的景点`);
                }
                else {
                    parts.push(`- ❌ 当前月份（${month}月）大部分F路关闭，天气恶劣`);
                    parts.push(`- ❌ 请避免推荐需要F路到达的景点和高地景点`);
                    parts.push(`- ✅ 可以推荐：雷克雅未克周边、南岸、冰河湖等低地景点`);
                }
                parts.push(`- 📌 F路和高地景点仅在6-9月开放，其他月份不可达`);
            }
            else {
                parts.push(`\n## ⚠️ 季节性约束提醒`);
                parts.push(`- 请确保推荐的景点在旅行日期（${month}月）是开放的`);
                parts.push(`- 注意季节性景点的开放时间（如F路、高地、冰川、国家公园等）`);
                parts.push(`- 如果某个景点在旅行日期不可达，请避免包含在方案中`);
            }
        }
        if (world) {
            parts.push(`\n## 世界模型信息`);
            if ((_k = world.routeDirection) === null || _k === void 0 ? void 0 : _k.name) {
                parts.push(`路线方向: ${world.routeDirection.name}`);
            }
            if (world.physical) {
                parts.push(`地形信息: 已加载`);
            }
            if (world.cost) {
                parts.push(`成本参考: 已加载`);
            }
            if (world.weather) {
                parts.push(`天气信息: 已加载`);
            }
        }
        parts.push(`\n## 要求`);
        parts.push(`请生成 2-3 套行程骨架方案，每套方案必须包含：`);
        parts.push(`1. 每天的主题和描述（description 控制在 50 字以内）`);
        parts.push(`2. 关键锚点（必须去的城市/活动，每个锚点包含 location 和 activity）`);
        parts.push(`3. 移动日安排（transferDays，包含 from、to、mode）`);
        parts.push(`4. 清晰的取舍理由（rationale，包含 philosophy、tradeoffs、strengths、weaknesses，每个条目控制在 30 字以内）`);
        parts.push(`\n## Few-shot Examples`);
        parts.push(this.getFewShotExamples(context.days));
        return parts.join('\n');
    }
    getFewShotExamples(days) {
        if (days <= 3) {
            return this.getShortTripExample();
        }
        else if (days <= 7) {
            return this.getMediumTripExample();
        }
        else {
            return this.getLongTripExample();
        }
    }
    getShortTripExample() {
        return `
### 示例 1: 3天冰岛黄金圈紧凑行程

**输入**：
- 目的地: 冰岛
- 天数: 3天
- 交通模式: 自驾
- 约束: 预算中等，体力中等

**输出**：
\`\`\`json
{
  "options": [
    {
      "id": "compact_1",
      "name": "紧凑型",
      "dayThemes": [
        {
          "day": 1,
          "theme": "雷克雅未克-黄金圈",
          "description": "游览黄金圈三大景点：辛格维利尔国家公园、间歇泉、黄金瀑布"
        },
        {
          "day": 2,
          "theme": "南岸-黑沙滩",
          "description": "前往维克，参观黑沙滩、迪霍拉里海岬，体验冰岛南岸风光"
        },
        {
          "day": 3,
          "theme": "返回雷克雅未克",
          "description": "返回首都，游览市区，体验冰岛文化"
        }
      ],
      "anchors": [
        {"day": 1, "location": "辛格维利尔", "activity": "参观国家公园", "priority": "anchor"},
        {"day": 2, "location": "维克", "activity": "黑沙滩", "priority": "anchor"}
      ],
      "transferDays": [
        {"day": 2, "from": "雷克雅未克", "to": "维克", "mode": "自驾"}
      ],
      "rationale": {
        "philosophy": "最大化利用有限时间，覆盖核心景点",
        "tradeoffs": ["节奏较紧，休息时间少", "深度体验有限"],
        "strengths": ["效率高", "覆盖主要景点", "适合时间有限的游客"],
        "weaknesses": ["疲劳度高", "缺乏深度体验"]
      }
    },
    {
      "id": "balanced_1",
      "name": "均衡型",
      "dayThemes": [
        {
          "day": 1,
          "theme": "雷克雅未克-黄金圈",
          "description": "游览黄金圈，晚上返回雷克雅未克休息"
        },
        {
          "day": 2,
          "theme": "南岸一日游",
          "description": "前往维克，参观黑沙滩，下午返回雷克雅未克"
        },
        {
          "day": 3,
          "theme": "雷克雅未克市区",
          "description": "深度游览首都，体验当地文化"
        }
      ],
      "anchors": [
        {"day": 1, "location": "黄金圈", "activity": "三大景点", "priority": "anchor"}
      ],
      "transferDays": [],
      "rationale": {
        "philosophy": "平衡体验和休息，以雷克雅未克为基地",
        "tradeoffs": ["减少移动时间", "南岸体验时间有限"],
        "strengths": ["节奏适中", "住宿稳定", "减少疲劳"],
        "weaknesses": ["南岸体验不够深入"]
      }
    }
  ],
  "recommendation": {
    "optionId": "balanced_1",
    "reason": "3天行程建议选择均衡型，避免过度疲劳"
  }
}
\`\`\`
`;
    }
    getMediumTripExample() {
        return `
### 示例 2: 5天冰岛环岛行程

**输入**：
- 目的地: 冰岛
- 天数: 5天
- 交通模式: 自驾
- 约束: 预算中等，体力中等

**输出**：
\`\`\`json
{
  "options": [
    {
      "id": "compact_2",
      "name": "紧凑型",
      "dayThemes": [
        {"day": 1, "theme": "雷克雅未克-黄金圈", "description": "游览黄金圈三大景点"},
        {"day": 2, "theme": "南岸-维克", "description": "前往维克，参观黑沙滩、瀑布"},
        {"day": 3, "theme": "杰古沙龙-东岸", "description": "冰河湖、钻石沙滩，前往东岸"},
        {"day": 4, "theme": "东岸-米湖", "description": "游览东岸小镇，前往米湖地区"},
        {"day": 5, "theme": "米湖-返回", "description": "米湖游览，返回雷克雅未克"}
      ],
      "anchors": [
        {"day": 1, "location": "黄金圈", "activity": "三大景点", "priority": "anchor"},
        {"day": 3, "location": "杰古沙龙", "activity": "冰河湖", "priority": "anchor"}
      ],
      "transferDays": [
        {"day": 2, "from": "雷克雅未克", "to": "维克", "mode": "自驾"},
        {"day": 3, "from": "维克", "to": "东岸", "mode": "自驾"},
        {"day": 4, "from": "东岸", "to": "米湖", "mode": "自驾"}
      ],
      "rationale": {
        "philosophy": "快速环岛，覆盖主要景点",
        "tradeoffs": ["驾驶时间长", "深度体验有限"],
        "strengths": ["覆盖全面", "效率高"],
        "weaknesses": ["疲劳度高", "缺乏深度"]
      }
    },
    {
      "id": "balanced_2",
      "name": "均衡型",
      "dayThemes": [
        {"day": 1, "theme": "雷克雅未克-黄金圈", "description": "游览黄金圈，返回雷克雅未克"},
        {"day": 2, "theme": "南岸-维克", "description": "前往维克，深度游览黑沙滩"},
        {"day": 3, "theme": "维克-杰古沙龙", "description": "前往冰河湖，深度体验"},
        {"day": 4, "theme": "杰古沙龙-东岸", "description": "游览东岸小镇，轻松节奏"},
        {"day": 5, "theme": "返回雷克雅未克", "description": "返回首都，市区游览"}
      ],
      "anchors": [
        {"day": 2, "location": "维克", "activity": "黑沙滩", "priority": "anchor"},
        {"day": 3, "location": "杰古沙龙", "activity": "冰河湖", "priority": "anchor"}
      ],
      "transferDays": [
        {"day": 2, "from": "雷克雅未克", "to": "维克", "mode": "自驾"},
        {"day": 3, "from": "维克", "to": "杰古沙龙", "mode": "自驾"},
        {"day": 4, "from": "杰古沙龙", "to": "东岸", "mode": "自驾"}
      ],
      "rationale": {
        "philosophy": "平衡体验和休息，适度深度",
        "tradeoffs": ["不完整环岛", "部分区域未覆盖"],
        "strengths": ["节奏适中", "深度体验", "疲劳可控"],
        "weaknesses": ["覆盖不全面"]
      }
    }
  ],
  "recommendation": {
    "optionId": "balanced_2",
    "reason": "5天行程建议均衡型，平衡体验和疲劳"
  }
}
\`\`\`
`;
    }
    getLongTripExample() {
        return `
### 示例 3: 10天冰岛深度行程

**输入**：
- 目的地: 冰岛
- 天数: 10天
- 交通模式: 自驾
- 约束: 预算中等，体力中等

**输出**：
\`\`\`json
{
  "options": [
    {
      "id": "balanced_3",
      "name": "均衡型",
      "dayThemes": [
        {"day": 1, "theme": "雷克雅未克", "description": "抵达，市区游览，适应时差"},
        {"day": 2, "theme": "黄金圈", "description": "深度游览黄金圈三大景点"},
        {"day": 3, "theme": "南岸-维克", "description": "前往维克，游览黑沙滩"},
        {"day": 4, "theme": "维克-杰古沙龙", "description": "前往冰河湖，深度体验"},
        {"day": 5, "theme": "东岸小镇", "description": "游览东岸小镇，轻松节奏"},
        {"day": 6, "theme": "米湖地区", "description": "米湖、地热区深度游览"},
        {"day": 7, "theme": "阿克雷里", "description": "前往阿克雷里，游览北部"},
        {"day": 8, "theme": "斯奈山半岛", "description": "前往斯奈山半岛，自然风光"},
        {"day": 9, "theme": "返回雷克雅未克", "description": "返回首都，市区深度游"},
        {"day": 10, "theme": "雷克雅未克", "description": "最后一天，购物和休息"}
      ],
      "anchors": [
        {"day": 2, "location": "黄金圈", "activity": "三大景点", "priority": "anchor"},
        {"day": 4, "location": "杰古沙龙", "activity": "冰河湖", "priority": "anchor"},
        {"day": 6, "location": "米湖", "activity": "地热区", "priority": "anchor"}
      ],
      "transferDays": [
        {"day": 3, "from": "雷克雅未克", "to": "维克", "mode": "自驾"},
        {"day": 4, "from": "维克", "to": "杰古沙龙", "mode": "自驾"},
        {"day": 5, "from": "杰古沙龙", "to": "东岸", "mode": "自驾"},
        {"day": 6, "from": "东岸", "to": "米湖", "mode": "自驾"},
        {"day": 7, "from": "米湖", "to": "阿克雷里", "mode": "自驾"},
        {"day": 8, "from": "阿克雷里", "to": "斯奈山", "mode": "自驾"},
        {"day": 9, "from": "斯奈山", "to": "雷克雅未克", "mode": "自驾"}
      ],
      "rationale": {
        "philosophy": "深度体验，平衡节奏和覆盖",
        "tradeoffs": ["需要多次换宿", "规划复杂度高"],
        "strengths": ["深度体验", "覆盖全面", "节奏可控"],
        "weaknesses": ["规划复杂", "需要多次移动"]
      }
    },
    {
      "id": "relaxed_3",
      "name": "松弛型",
      "dayThemes": [
        {"day": 1, "theme": "雷克雅未克", "description": "抵达，休息适应"},
        {"day": 2, "theme": "雷克雅未克-黄金圈", "description": "黄金圈一日游，返回"},
        {"day": 3, "theme": "雷克雅未克", "description": "市区深度游，休息"},
        {"day": 4, "theme": "南岸-维克", "description": "前往维克，轻松游览"},
        {"day": 5, "theme": "维克", "description": "维克深度游，休息"},
        {"day": 6, "theme": "维克-杰古沙龙", "description": "前往冰河湖"},
        {"day": 7, "theme": "杰古沙龙", "description": "冰河湖深度体验"},
        {"day": 8, "theme": "返回雷克雅未克", "description": "返回首都"},
        {"day": 9, "theme": "雷克雅未克", "description": "市区游览，购物"},
        {"day": 10, "theme": "雷克雅未克", "description": "最后一天，休息"}
      ],
      "anchors": [
        {"day": 2, "location": "黄金圈", "activity": "三大景点", "priority": "anchor"},
        {"day": 6, "location": "杰古沙龙", "activity": "冰河湖", "priority": "anchor"}
      ],
      "transferDays": [
        {"day": 4, "from": "雷克雅未克", "to": "维克", "mode": "自驾"},
        {"day": 6, "from": "维克", "to": "杰古沙龙", "mode": "自驾"},
        {"day": 8, "from": "杰古沙龙", "to": "雷克雅未克", "mode": "自驾"}
      ],
      "rationale": {
        "philosophy": "注重休息和深度，不追求覆盖",
        "tradeoffs": ["覆盖不全面", "部分区域未游览"],
        "strengths": ["节奏慢", "深度体验", "疲劳低"],
        "weaknesses": ["覆盖有限", "可能错过重要景点"]
      }
    }
  ],
  "recommendation": {
    "optionId": "balanced_3",
    "reason": "10天行程建议均衡型，充分利用时间深度体验"
  }
}
\`\`\`
`;
    }
    async enrichSkeletonWithPois(skeletonSet, context, tripId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!skeletonSet.options) {
            return;
        }
        let tripPoisByDay = new Map();
        if (tripId && this.prisma) {
            try {
                this.logger.debug(`从当前行程 ${tripId} 获取POI信息...`);
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    include: {
                        TripDay: {
                            orderBy: { date: 'asc' },
                            include: {
                                ItineraryItem: {
                                    orderBy: { startTime: 'asc' },
                                    include: {
                                        Place: {
                                            select: {
                                                id: true,
                                                uuid: true,
                                                nameCN: true,
                                                nameEN: true,
                                                category: true,
                                                address: true,
                                                rating: true,
                                                description: true,
                                                metadata: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });
                if (trip && trip.TripDay) {
                    const placeIds = trip.TripDay.flatMap(day => day.ItineraryItem.filter(item => item.placeId).map(item => item.placeId));
                    const locationMap = new Map();
                    if (placeIds.length > 0) {
                        try {
                            const locationResults = await this.prisma.$queryRaw `
                SELECT 
                  id,
                  ST_Y(location::geometry) as lat,
                  ST_X(location::geometry) as lng
                FROM "Place"
                WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
              `;
                            locationResults.forEach(result => {
                                locationMap.set(result.id, {
                                    lat: Number(result.lat),
                                    lng: Number(result.lng),
                                });
                            });
                            this.logger.debug(`批量查询 ${placeIds.length} 个POI的坐标，成功获取 ${locationResults.length} 个坐标（PostGIS）`);
                        }
                        catch (error) {
                            this.logger.debug(`批量提取坐标失败（PostGIS）: ${error.message}，将尝试从 metadata 获取`);
                        }
                        const places = trip.TripDay.flatMap(day => day.ItineraryItem.map(item => item.Place).filter(Boolean));
                        for (const place of places) {
                            if (place && !locationMap.has(place.id)) {
                                const metadata = place.metadata || {};
                                if (metadata.lat && metadata.lng) {
                                    locationMap.set(place.id, { lat: Number(metadata.lat), lng: Number(metadata.lng) });
                                }
                                else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                                    locationMap.set(place.id, { lat: Number(metadata.coordinates[1]), lng: Number(metadata.coordinates[0]) });
                                }
                            }
                        }
                    }
                    trip.TripDay.forEach((day, dayIndex) => {
                        const dayNumber = dayIndex + 1;
                        const items = day.ItineraryItem.filter(item => item.Place);
                        const accommodation = items.find(item => { var _a; return ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.category) === 'HOTEL' || item.type === 'REST'; });
                        const restaurants = items.filter(item => { var _a; return ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.category) === 'RESTAURANT' || item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING'; });
                        const attractions = items.filter(item => { var _a; return ((_a = item.Place) === null || _a === void 0 ? void 0 : _a.category) === 'ATTRACTION' || item.type === 'ACTIVITY'; });
                        const dayPoi = {
                            restaurants: [],
                            attractions: [],
                        };
                        if (accommodation === null || accommodation === void 0 ? void 0 : accommodation.Place) {
                            const coords = locationMap.get(accommodation.Place.id);
                            dayPoi.accommodation = this.placeToSkeletonPoi(accommodation.Place, coords);
                        }
                        restaurants.slice(0, 3).forEach((restaurant, idx) => {
                            if (restaurant.Place) {
                                const coords = locationMap.get(restaurant.Place.id);
                                const meals = ['breakfast', 'lunch', 'dinner'];
                                dayPoi.restaurants.push({
                                    meal: meals[idx] || 'lunch',
                                    poi: this.placeToSkeletonPoi(restaurant.Place, coords),
                                });
                            }
                        });
                        attractions.forEach(attraction => {
                            if (attraction.Place) {
                                const coords = locationMap.get(attraction.Place.id);
                                dayPoi.attractions.push(this.placeToSkeletonPoi(attraction.Place, coords));
                            }
                        });
                        if (dayPoi.accommodation || dayPoi.restaurants.length > 0 || dayPoi.attractions.length > 0) {
                            tripPoisByDay.set(dayNumber, dayPoi);
                        }
                    });
                    this.logger.debug(`从当前行程获取了 ${tripPoisByDay.size} 天的POI信息`);
                }
            }
            catch (error) {
                this.logger.warn(`从当前行程获取POI失败: ${error.message}，将使用Place表查询`);
            }
        }
        if (!this.placesService) {
            if (tripPoisByDay.size > 0) {
                this.applyTripPoisToSkeleton(skeletonSet, tripPoisByDay);
            }
            return;
        }
        const countryName = context.destination.country || '';
        const countryCodeMap = {
            '冰岛': 'IS',
            'Iceland': 'IS',
            '格陵兰': 'GL',
            'Greenland': 'GL',
            '阿根廷': 'AR',
            'Argentina': 'AR',
            '中国': 'CN',
            'China': 'CN',
            '日本': 'JP',
            'Japan': 'JP',
            '美国': 'US',
            'United States': 'US',
            'USA': 'US',
            '英国': 'GB',
            'United Kingdom': 'GB',
            'UK': 'GB',
            '法国': 'FR',
            'France': 'FR',
            '德国': 'DE',
            'Germany': 'DE',
            '意大利': 'IT',
            'Italy': 'IT',
            '西班牙': 'ES',
            'Spain': 'ES',
        };
        const countryCode = countryCodeMap[countryName] ||
            (countryName.length === 2 && /^[A-Z]{2}$/.test(countryName) ? countryName : null);
        if (!countryCode) {
            if (tripPoisByDay.size > 0) {
                this.applyTripPoisToSkeleton(skeletonSet, tripPoisByDay);
            }
            else {
                this.logger.warn(`无法确定国家代码（国家名称: ${countryName}），且无行程POI，跳过 POI 补充`);
            }
            return;
        }
        this.logger.debug(`开始为 ${skeletonSet.options.length} 个骨架方案补充 POI 信息（行程POI: ${tripPoisByDay.size} 天，国家代码: ${countryCode || '未知'}）`);
        for (let optionIdx = 0; optionIdx < skeletonSet.options.length; optionIdx++) {
            const option = skeletonSet.options[optionIdx];
            this.logger.debug(`[${optionIdx + 1}/${skeletonSet.options.length}] 开始为骨架方案 ${option.id} (${option.name}) 补充 POI，共 ${((_a = option.dayThemes) === null || _a === void 0 ? void 0 : _a.length) || 0} 天`);
            if (!option.dayThemes || option.dayThemes.length === 0) {
                this.logger.debug(`骨架方案 ${option.id} 没有 dayThemes，跳过`);
                continue;
            }
            const dayPois = [];
            for (let dayIdx = 0; dayIdx < option.dayThemes.length; dayIdx++) {
                const dayTheme = option.dayThemes[dayIdx];
                const day = dayTheme.day;
                this.logger.debug(`[${optionIdx + 1}/${skeletonSet.options.length}] 骨架方案 ${option.id}，第 ${dayIdx + 1}/${option.dayThemes.length} 天（第 ${day} 天）：${dayTheme.theme || '无主题'}`);
                const tripDayPoi = tripPoisByDay.get(day);
                if (tripDayPoi) {
                    this.logger.debug(`第 ${day} 天：使用行程中的POI（住宿: ${!!tripDayPoi.accommodation}, 餐厅: ${tripDayPoi.restaurants.length}, 景点: ${tripDayPoi.attractions.length}）`);
                    dayPois.push({
                        day,
                        ...(tripDayPoi.accommodation && { accommodation: tripDayPoi.accommodation }),
                        ...(tripDayPoi.restaurants.length > 0 && { restaurants: tripDayPoi.restaurants }),
                        ...(tripDayPoi.attractions.length > 0 && { attractions: tripDayPoi.attractions }),
                    });
                    continue;
                }
                if (!countryCode) {
                    this.logger.debug(`第 ${day} 天：无法确定国家代码，跳过POI查询`);
                    continue;
                }
                const theme = dayTheme.theme || '';
                const description = dayTheme.description || '';
                this.logger.debug(`第 ${day} 天：开始从Place表查询POI（主题: ${theme}, 描述: ${description.substring(0, 50)}...）`);
                const semanticQuery = this.buildSemanticQuery(option, day, theme, description);
                let accommodation;
                try {
                    const hotelQuery = semanticQuery.hotel || `${theme} ${description} 住宿 酒店`;
                    this.logger.debug(`第 ${day} 天：开始语义搜索住宿，查询: "${hotelQuery}"`);
                    const searchStartTime = Date.now();
                    const searchPromise = this.placesService.semanticSearch(hotelQuery, undefined, undefined, undefined, 'HOTEL', 5, countryCode);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('语义搜索超时（15秒）')), 15000);
                    });
                    const hotelResults = await Promise.race([searchPromise, timeoutPromise]);
                    const searchDuration = Date.now() - searchStartTime;
                    this.logger.debug(`第 ${day} 天：语义搜索住宿完成，耗时 ${searchDuration}ms，找到 ${(hotelResults === null || hotelResults === void 0 ? void 0 : hotelResults.length) || 0} 个结果`);
                    if (hotelResults && hotelResults.length > 0) {
                        const bestHotel = hotelResults.sort((a, b) => {
                            if (b.finalScore !== a.finalScore)
                                return b.finalScore - a.finalScore;
                            return b.vectorScore - a.vectorScore;
                        })[0];
                        const fullPlace = await ((_b = this.prisma) === null || _b === void 0 ? void 0 : _b.place.findUnique({
                            where: { id: bestHotel.id },
                            select: {
                                id: true,
                                uuid: true,
                                nameCN: true,
                                nameEN: true,
                                category: true,
                                address: true,
                                rating: true,
                                description: true,
                                metadata: true,
                            },
                        }));
                        if (fullPlace && this.prisma) {
                            let coords = undefined;
                            try {
                                const locationResult = await this.prisma.$queryRaw `
                  SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                  FROM "Place"
                  WHERE id = ${bestHotel.id} AND location IS NOT NULL
                  LIMIT 1
                `;
                                if (locationResult && locationResult.length > 0 && locationResult[0]) {
                                    coords = {
                                        lat: Number(locationResult[0].lat),
                                        lng: Number(locationResult[0].lng),
                                    };
                                    this.logger.debug(`住宿 ${bestHotel.id} (${bestHotel.nameCN}) 坐标（PostGIS）: lat=${coords.lat}, lng=${coords.lng}`);
                                }
                                else {
                                    this.logger.debug(`住宿 ${bestHotel.id} (${bestHotel.nameCN}) PostGIS location 查询返回空，尝试从 metadata 获取坐标`);
                                }
                            }
                            catch (postgisError) {
                                this.logger.debug(`住宿 ${bestHotel.id} PostGIS 查询失败: ${postgisError.message}，尝试从 metadata 获取坐标`);
                            }
                            if (!coords) {
                                const metadata = fullPlace.metadata || {};
                                if (metadata.lat && metadata.lng) {
                                    coords = { lat: Number(metadata.lat), lng: Number(metadata.lng) };
                                    this.logger.debug(`住宿 ${bestHotel.id} 坐标（metadata）: lat=${coords.lat}, lng=${coords.lng}`);
                                }
                                else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                                    coords = { lat: Number(metadata.coordinates[1]), lng: Number(metadata.coordinates[0]) };
                                    this.logger.debug(`住宿 ${bestHotel.id} 坐标（metadata.coordinates）: lat=${coords.lat}, lng=${coords.lng}`);
                                }
                                else {
                                    this.logger.warn(`住宿 ${bestHotel.id} (${bestHotel.nameCN}) 无法获取坐标（PostGIS 和 metadata 都为空）`);
                                }
                            }
                            accommodation = this.placeToSkeletonPoi(fullPlace, coords);
                            this.logger.debug(`语义搜索找到住宿: ${bestHotel.nameCN} (score: ${bestHotel.finalScore.toFixed(3)}, 坐标: ${coords ? `lat=${coords.lat}, lng=${coords.lng}` : '无'})`);
                        }
                    }
                }
                catch (error) {
                    const isTimeout = ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('超时')) || ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('timeout'));
                    if (isTimeout) {
                        this.logger.warn(`语义搜索第 ${day} 天住宿超时: ${error.message}，尝试降级到关键词搜索`);
                    }
                    else {
                        this.logger.debug(`语义搜索第 ${day} 天住宿失败: ${error.message}，尝试降级到关键词搜索`);
                    }
                    try {
                        const hotels = await this.placesService.getPlacesByCountryCode({
                            countryCode,
                            category: 'HOTEL',
                            search: theme,
                            limit: 5,
                        });
                        if (hotels.places && hotels.places.length > 0) {
                            accommodation = this.placeToSkeletonPoi(hotels.places[0], hotels.places[0].location);
                        }
                    }
                    catch (fallbackError) {
                        this.logger.debug(`关键词搜索第 ${day} 天住宿也失败: ${fallbackError.message}`);
                    }
                }
                const restaurants = [];
                try {
                    const restaurantQuery = semanticQuery.restaurant || `${theme} ${description} 餐厅 美食`;
                    this.logger.debug(`第 ${day} 天：开始语义搜索餐厅，查询: "${restaurantQuery}"`);
                    const searchStartTime = Date.now();
                    const searchPromise = this.placesService.semanticSearch(restaurantQuery, undefined, undefined, undefined, 'RESTAURANT', 10, countryCode);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('语义搜索超时（15秒）')), 15000);
                    });
                    const restaurantResults = await Promise.race([searchPromise, timeoutPromise]);
                    const searchDuration = Date.now() - searchStartTime;
                    this.logger.debug(`第 ${day} 天：语义搜索餐厅完成，耗时 ${searchDuration}ms，找到 ${(restaurantResults === null || restaurantResults === void 0 ? void 0 : restaurantResults.length) || 0} 个结果`);
                    if (restaurantResults && restaurantResults.length > 0) {
                        const selectedRestaurants = restaurantResults
                            .sort((a, b) => {
                            if (b.finalScore !== a.finalScore)
                                return b.finalScore - a.finalScore;
                            return b.vectorScore - a.vectorScore;
                        })
                            .slice(0, 3);
                        const meals = ['breakfast', 'lunch', 'dinner'];
                        for (let idx = 0; idx < selectedRestaurants.length && idx < meals.length; idx++) {
                            const result = selectedRestaurants[idx];
                            const fullPlace = await ((_e = this.prisma) === null || _e === void 0 ? void 0 : _e.place.findUnique({
                                where: { id: result.id },
                                select: {
                                    id: true,
                                    uuid: true,
                                    nameCN: true,
                                    nameEN: true,
                                    category: true,
                                    address: true,
                                    rating: true,
                                    description: true,
                                    metadata: true,
                                },
                            }));
                            if (fullPlace && this.prisma) {
                                let coords = undefined;
                                try {
                                    const locationResult = await this.prisma.$queryRaw `
                    SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                    FROM "Place"
                    WHERE id = ${result.id} AND location IS NOT NULL
                    LIMIT 1
                  `;
                                    if (locationResult && locationResult.length > 0 && locationResult[0]) {
                                        coords = {
                                            lat: Number(locationResult[0].lat),
                                            lng: Number(locationResult[0].lng),
                                        };
                                    }
                                }
                                catch (postgisError) {
                                    this.logger.debug(`餐厅 ${result.id} PostGIS 查询失败: ${postgisError.message}，尝试从 metadata 获取坐标`);
                                }
                                if (!coords) {
                                    const metadata = fullPlace.metadata || {};
                                    if (metadata.lat && metadata.lng) {
                                        coords = { lat: Number(metadata.lat), lng: Number(metadata.lng) };
                                    }
                                    else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                                        coords = { lat: Number(metadata.coordinates[1]), lng: Number(metadata.coordinates[0]) };
                                    }
                                }
                                restaurants.push({
                                    meal: meals[idx],
                                    poi: this.placeToSkeletonPoi(fullPlace, coords),
                                });
                            }
                        }
                        this.logger.debug(`语义搜索找到 ${restaurants.length} 个餐厅`);
                    }
                }
                catch (error) {
                    const isTimeout = ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('超时')) || ((_g = error.message) === null || _g === void 0 ? void 0 : _g.includes('timeout'));
                    const errorMsg = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || '未知错误';
                    if (isTimeout) {
                        this.logger.warn(`语义搜索第 ${day} 天餐厅超时: ${errorMsg}，尝试降级到关键词搜索`);
                    }
                    else {
                        this.logger.debug(`语义搜索第 ${day} 天餐厅失败: ${errorMsg}，尝试降级到关键词搜索`);
                    }
                    try {
                        const restaurantResults = await this.placesService.getPlacesByCountryCode({
                            countryCode,
                            category: 'RESTAURANT',
                            search: `${theme} ${description}`,
                            limit: 10,
                        });
                        if (restaurantResults.places && restaurantResults.places.length > 0) {
                            const selectedRestaurants = restaurantResults.places.slice(0, 3);
                            const meals = ['breakfast', 'lunch', 'dinner'];
                            selectedRestaurants.forEach((place, idx) => {
                                if (idx < meals.length) {
                                    restaurants.push({
                                        meal: meals[idx],
                                        poi: this.placeToSkeletonPoi(place, place.location),
                                    });
                                }
                            });
                        }
                    }
                    catch (fallbackError) {
                        this.logger.debug(`关键词搜索第 ${day} 天餐厅也失败: ${fallbackError.message}`);
                    }
                }
                let attractions = [];
                try {
                    const attractionQuery = semanticQuery.attraction || `${theme} ${description} 景点 观光`;
                    this.logger.debug(`第 ${day} 天：开始语义搜索景点，查询: "${attractionQuery}"`);
                    const searchStartTime = Date.now();
                    const searchPromise = this.placesService.semanticSearch(attractionQuery, undefined, undefined, undefined, 'ATTRACTION', 10, countryCode);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('语义搜索超时（15秒）')), 15000);
                    });
                    const attractionResults = await Promise.race([searchPromise, timeoutPromise]);
                    const searchDuration = Date.now() - searchStartTime;
                    this.logger.debug(`第 ${day} 天：语义搜索景点完成，耗时 ${searchDuration}ms，找到 ${(attractionResults === null || attractionResults === void 0 ? void 0 : attractionResults.length) || 0} 个结果`);
                    if (attractionResults && attractionResults.length > 0) {
                        const selectedAttractions = attractionResults
                            .sort((a, b) => {
                            if (b.finalScore !== a.finalScore)
                                return b.finalScore - a.finalScore;
                            return b.vectorScore - a.vectorScore;
                        })
                            .slice(0, 5);
                        for (const result of selectedAttractions) {
                            const fullPlace = await ((_h = this.prisma) === null || _h === void 0 ? void 0 : _h.place.findUnique({
                                where: { id: result.id },
                                select: {
                                    id: true,
                                    uuid: true,
                                    nameCN: true,
                                    nameEN: true,
                                    category: true,
                                    address: true,
                                    rating: true,
                                    description: true,
                                    metadata: true,
                                },
                            }));
                            if (fullPlace && this.prisma) {
                                let coords = undefined;
                                try {
                                    const locationResult = await this.prisma.$queryRaw `
                    SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                    FROM "Place"
                    WHERE id = ${result.id} AND location IS NOT NULL
                    LIMIT 1
                  `;
                                    if (locationResult && locationResult.length > 0 && locationResult[0]) {
                                        coords = {
                                            lat: Number(locationResult[0].lat),
                                            lng: Number(locationResult[0].lng),
                                        };
                                    }
                                }
                                catch (postgisError) {
                                    this.logger.debug(`景点 ${result.id} PostGIS 查询失败: ${postgisError.message}，尝试从 metadata 获取坐标`);
                                }
                                if (!coords) {
                                    const metadata = fullPlace.metadata || {};
                                    if (metadata.lat && metadata.lng) {
                                        coords = { lat: Number(metadata.lat), lng: Number(metadata.lng) };
                                    }
                                    else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                                        coords = { lat: Number(metadata.coordinates[1]), lng: Number(metadata.coordinates[0]) };
                                    }
                                }
                                attractions.push(this.placeToSkeletonPoi(fullPlace, coords));
                            }
                        }
                        this.logger.debug(`语义搜索找到 ${attractions.length} 个景点`);
                    }
                }
                catch (error) {
                    const isTimeout = ((_j = error.message) === null || _j === void 0 ? void 0 : _j.includes('超时')) || ((_k = error.message) === null || _k === void 0 ? void 0 : _k.includes('timeout'));
                    if (isTimeout) {
                        this.logger.warn(`语义搜索第 ${day} 天景点超时: ${error.message}，尝试降级到关键词搜索`);
                    }
                    else {
                        this.logger.debug(`语义搜索第 ${day} 天景点失败: ${error.message}，尝试降级到关键词搜索`);
                    }
                    try {
                        const attractionResults = await this.placesService.getPlacesByCountryCode({
                            countryCode,
                            category: 'ATTRACTION',
                            search: `${theme} ${description}`,
                            limit: 10,
                        });
                        if (attractionResults.places && attractionResults.places.length > 0) {
                            attractions = attractionResults.places.slice(0, 5).map(place => this.placeToSkeletonPoi(place, place.location));
                        }
                    }
                    catch (fallbackError) {
                        this.logger.debug(`关键词搜索第 ${day} 天景点也失败: ${fallbackError.message}`);
                    }
                }
                if (accommodation || restaurants.length > 0 || attractions.length > 0) {
                    dayPois.push({
                        day,
                        ...(accommodation && { accommodation }),
                        ...(restaurants.length > 0 && { restaurants }),
                        ...(attractions.length > 0 && { attractions }),
                    });
                }
            }
            if (dayPois.length > 0) {
                option.pois = dayPois;
                const totalPois = dayPois.reduce((sum, dp) => {
                    var _a, _b;
                    return sum + (dp.accommodation ? 1 : 0) + (((_a = dp.restaurants) === null || _a === void 0 ? void 0 : _a.length) || 0) + (((_b = dp.attractions) === null || _b === void 0 ? void 0 : _b.length) || 0);
                }, 0);
                this.logger.debug(`[${optionIdx + 1}/${skeletonSet.options.length}] 已为骨架方案 ${option.id} (${option.name}) 补充 ${dayPois.length} 天的 POI 信息（总计 ${totalPois} 个POI）`);
            }
            else {
                this.logger.warn(`[${optionIdx + 1}/${skeletonSet.options.length}] 骨架方案 ${option.id} (${option.name}) 没有找到任何POI`);
            }
        }
        this.logger.debug(`完成所有骨架方案的 POI 补充（共 ${skeletonSet.options.length} 个方案）`);
    }
    applyTripPoisToSkeleton(skeletonSet, tripPoisByDay) {
        for (const option of skeletonSet.options || []) {
            if (!option.dayThemes || option.dayThemes.length === 0) {
                continue;
            }
            const dayPois = [];
            for (const dayTheme of option.dayThemes) {
                const day = dayTheme.day;
                const tripDayPoi = tripPoisByDay.get(day);
                if (tripDayPoi) {
                    dayPois.push({
                        day,
                        ...(tripDayPoi.accommodation && { accommodation: tripDayPoi.accommodation }),
                        ...(tripDayPoi.restaurants.length > 0 && { restaurants: tripDayPoi.restaurants }),
                        ...(tripDayPoi.attractions.length > 0 && { attractions: tripDayPoi.attractions }),
                    });
                }
            }
            if (dayPois.length > 0) {
                option.pois = dayPois;
                this.logger.debug(`已为骨架方案 ${option.id} 应用 ${dayPois.length} 天的行程POI信息`);
            }
        }
    }
    buildSemanticQuery(option, day, theme, description) {
        var _a;
        const dayAnchors = ((_a = option.anchors) === null || _a === void 0 ? void 0 : _a.filter(a => a.day === day)) || [];
        const anchorLocations = dayAnchors.map(a => a.location).join(' ');
        const anchorActivities = dayAnchors.map(a => a.activity).join(' ');
        const baseQuery = `${theme} ${description}`.trim();
        const fullContext = `${baseQuery} ${anchorLocations} ${anchorActivities}`.trim();
        return {
            hotel: `${fullContext} 住宿 酒店 旅馆`,
            restaurant: `${fullContext} 餐厅 美食 餐饮`,
            attraction: `${fullContext} 景点 观光 游览`,
        };
    }
    extractSearchKeywords(option, day, theme, description) {
        var _a;
        const keywords = [];
        const themeWords = theme.split(/[\s，,、]+/).filter(word => word.length > 1 &&
            !['第', '天', '的', '和', '与', '或', '在', '到', '从'].includes(word));
        keywords.push(...themeWords.slice(0, 2));
        const descWords = description.split(/[\s，,、。.]+/).filter(word => word.length > 1 &&
            !['第', '天', '的', '和', '与', '或', '在', '到', '从', '体验', '参观', '游览'].includes(word));
        keywords.push(...descWords.slice(0, 2));
        const dayAnchors = ((_a = option.anchors) === null || _a === void 0 ? void 0 : _a.filter(a => a.day === day)) || [];
        dayAnchors.forEach(anchor => {
            if (anchor.location && anchor.location.length > 1) {
                keywords.push(anchor.location);
            }
            if (anchor.activity && anchor.activity.length > 1) {
                keywords.push(anchor.activity);
            }
        });
        return [...new Set(keywords)].slice(0, 5);
    }
    placeToSkeletonPoi(place, coordinates) {
        return {
            placeId: place.id,
            placeUuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            address: place.address || undefined,
            rating: place.rating || undefined,
            description: place.description || undefined,
            coordinates: coordinates || place.location || place.coordinates || undefined,
            metadata: place.metadata || undefined,
        };
    }
    getDefaultSkeletonSet(context) {
        const days = context.days;
        const destination = context.destination.city || context.destination.country || '目的地';
        const defaultOption = {
            id: 'default_1',
            name: '均衡型方案',
            dayThemes: Array.from({ length: days }, (_, i) => ({
                day: i + 1,
                theme: `第${i + 1}天`,
                description: `在${destination}的第${i + 1}天行程`,
            })),
            anchors: [
                {
                    day: 1,
                    location: destination,
                    activity: '抵达并适应',
                    priority: 'anchor',
                },
            ],
            transferDays: [],
            rationale: {
                philosophy: '均衡型方案，适合大多数用户',
                tradeoffs: ['平衡体验和休息'],
                strengths: ['节奏适中', '适合初次到访'],
                weaknesses: ['可能需要更多时间探索'],
            },
        };
        return {
            skeletonSet: {
                options: [defaultOption],
                recommendation: {
                    optionId: 'default_1',
                    reason: '默认方案，LLM 调用失败时使用',
                },
            },
            evidence: [],
        };
    }
    validateSeasonalConstraints(skeletonSet, startDate, countryCode) {
        var _a, _b, _c, _d;
        const travelMonth = new Date(startDate).getMonth() + 1;
        const isIceland = countryCode === 'IS' || countryCode === '冰岛' || countryCode === 'Iceland';
        const isFRoadSeason = travelMonth >= 6 && travelMonth <= 9;
        const warnings = [];
        const violations = [];
        const icelandFRoadKeywords = [
            'Landmannalaugar', '兰德曼纳劳卡', 'Landmannalaugar',
            'Þórsmörk', 'Thorsmork', '索斯莫克', 'Thorsmörk',
            'Sprengisandur', '斯普伦吉桑杜尔',
            'Askja', '阿斯恰',
            'Kerlingarfjöll', '凯德灵加山',
            'Kverkfjöll', '克韦尔克山',
            'F208', 'F225', 'F249', 'F26', 'F910', 'F88',
            'highland', '高地', '内陆高地', 'highlands',
            'F-road', 'F路', 'F road',
        ];
        if (!isIceland || isFRoadSeason) {
            return {
                travelMonth,
                isFRoadSeason,
                warnings: [],
                violations: [],
            };
        }
        if (skeletonSet.options) {
            for (const option of skeletonSet.options) {
                if (option.dayThemes) {
                    for (const dayTheme of option.dayThemes) {
                        const themeText = `${dayTheme.theme || ''} ${dayTheme.description || ''}`.toLowerCase();
                        const hasFRoadKeyword = icelandFRoadKeywords.some(keyword => themeText.includes(keyword.toLowerCase()));
                        if (hasFRoadKeyword) {
                            const violation = {
                                optionId: option.id,
                                optionName: option.name,
                                day: dayTheme.day,
                                location: dayTheme.theme || '未知',
                                reason: `包含F路/高地景点（${dayTheme.theme}），但旅行日期（${travelMonth}月）不在F路开放季节（6-9月）`,
                            };
                            violations.push(violation);
                            warnings.push(`方案 "${option.name}" 第${dayTheme.day}天包含F路/高地景点 "${dayTheme.theme}"，但${travelMonth}月F路不可达`);
                        }
                    }
                }
                if (option.anchors) {
                    for (const anchor of option.anchors) {
                        const anchorText = `${anchor.location || ''} ${anchor.activity || ''}`.toLowerCase();
                        const hasFRoadKeyword = icelandFRoadKeywords.some(keyword => anchorText.includes(keyword.toLowerCase()));
                        if (hasFRoadKeyword) {
                            const violation = {
                                optionId: option.id,
                                optionName: option.name,
                                day: anchor.day,
                                location: anchor.location || '未知',
                                reason: `锚点包含F路/高地景点（${anchor.location}），但旅行日期（${travelMonth}月）不在F路开放季节（6-9月）`,
                            };
                            violations.push(violation);
                            warnings.push(`方案 "${option.name}" 第${anchor.day}天锚点 "${anchor.location}" 需要F路到达，但${travelMonth}月F路不可达`);
                        }
                    }
                }
                if (option.pois) {
                    for (const dayPoi of option.pois) {
                        const restaurantNames = ((_a = dayPoi.restaurants) === null || _a === void 0 ? void 0 : _a.map(r => { var _a, _b; return `${((_a = r.poi) === null || _a === void 0 ? void 0 : _a.nameCN) || ''} ${((_b = r.poi) === null || _b === void 0 ? void 0 : _b.nameEN) || ''}`; }).join(' ')) || '';
                        const attractionNames = ((_b = dayPoi.attractions) === null || _b === void 0 ? void 0 : _b.map(a => `${a.nameCN || ''} ${a.nameEN || ''}`).join(' ')) || '';
                        const poiText = `${((_c = dayPoi.accommodation) === null || _c === void 0 ? void 0 : _c.nameCN) || ''} ${((_d = dayPoi.accommodation) === null || _d === void 0 ? void 0 : _d.nameEN) || ''} ${restaurantNames} ${attractionNames}`.toLowerCase();
                        const hasFRoadKeyword = icelandFRoadKeywords.some(keyword => poiText.includes(keyword.toLowerCase()));
                        if (hasFRoadKeyword) {
                            const violation = {
                                optionId: option.id,
                                optionName: option.name,
                                day: dayPoi.day,
                                location: 'POI',
                                reason: `POI包含F路/高地景点，但旅行日期（${travelMonth}月）不在F路开放季节（6-9月）`,
                            };
                            violations.push(violation);
                            warnings.push(`方案 "${option.name}" 第${dayPoi.day}天包含需要F路到达的POI，但${travelMonth}月F路不可达`);
                        }
                    }
                }
            }
        }
        return {
            travelMonth,
            isFRoadSeason,
            warnings,
            violations,
        };
    }
};
exports.PlanArchitectGenerateSkeletonSkill = PlanArchitectGenerateSkeletonSkill;
exports.PlanArchitectGenerateSkeletonSkill = PlanArchitectGenerateSkeletonSkill = PlanArchitectGenerateSkeletonSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => places_service_1.PlacesService))),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        world_build_context_skill_1.WorldBuildContextSkill,
        places_service_1.PlacesService,
        prisma_service_1.PrismaService])
], PlanArchitectGenerateSkeletonSkill);
//# sourceMappingURL=plan-architect-generate-skeleton.skill.js.map