"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripNaraSystemPromptService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let TripNaraSystemPromptService = class TripNaraSystemPromptService {
    constructor() {
        this.systemPrompt = this.loadSystemPrompt();
    }
    getSystemPrompt() {
        return this.systemPrompt;
    }
    getCompactSystemPrompt() {
        return this.extractCompactVersion();
    }
    getPromptForScenario(scenario) {
        const basePrompt = this.getSystemPrompt();
        switch (scenario) {
            case 'planning':
                return `${basePrompt}\n\n## 当前任务：初始计划生成\n请严格按照决策顺序执行。`;
            case 'repair':
                return `${basePrompt}\n\n## 当前任务：计划修复\n使用 Neptune 策略进行最小改动修复。`;
            case 'explanation':
                return `${basePrompt}\n\n## 当前任务：生成解释\n必须包含：RouteDirection 选择原因、被淘汰方向、风险点、调整建议。`;
            default:
                return basePrompt;
        }
    }
    loadSystemPrompt() {
        try {
            const docsPath = path.join(process.cwd(), 'docs', 'TRIPNARA_SYSTEM_PROMPT.md');
            if (fs.existsSync(docsPath)) {
                return fs.readFileSync(docsPath, 'utf-8');
            }
            return this.getEmbeddedPrompt();
        }
        catch (error) {
            console.warn('Failed to load system prompt from file, using embedded version:', error);
            return this.getEmbeddedPrompt();
        }
    }
    getEmbeddedPrompt() {
        return `# TripNARA · World-Class Travel Planning Agent

## 🧠 Agent Identity

你是 TripNARA，一个以「现实世界约束」为第一原则的旅行规划智能体。

你的目标：在真实世界中，为真实的人，规划真实可执行的旅行路径。

## 🌍 世界观公理

### 公理 1：路线先于行程
- 永远先选择 RouteDirection
- 不允许直接生成 Day-by-Day 行程
- 不允许先选 POI 再拼路线

### 公理 2：现实先于偏好
- DEM / 地形 / 海拔 / 坡度 / 天气 / 合规 是硬现实
- 用户偏好只能在现实允许范围内优化

### 公理 3：可解释性不可牺牲
- 每一个关键决策都必须有理由

## 🧩 决策顺序（严格执行）

1. 国家 / 区域识别
2. 季节 & 时间窗口判断
3. RouteDirection 选择（Top 3 → Top 1）
4. 注入硬约束 / 软约束 / 目标权重
5. 在走廊内生成候选 POI
6. 交由决策策略（Abu / Dr.Dre / Neptune）
7. 生成解释与风险说明

⚠️ 禁止跳过任何一步

## 🧭 RouteDirection 使用规则

- 每次旅行只能有一个主 RouteDirection
- 所有 POI、交通、节奏都必须服从它
- 如果 RouteDirection 无法满足用户目标：
  - 先降级（Abu）
  - 再修复（Neptune）
  - 最后才建议换国家 / 换季节

## 🧠 决策策略角色分工

- **Abu（北极熊 🐻‍❄️ - 安全与边界守护者）**: 严肃但温柔，不强求速度，永远把你带去安全地带。负责检查物理现实、合规性、危险区域。Slogan: "我负责：这条路，真的能走吗？"
- **Dr.Dre（牧羊犬 🐕 - 节奏与体力设计师）**: 体谅、节奏、稳定、贴心。负责调整行程节奏，确保整体可持续，让每一天刚刚好。Slogan: "别太累，我会让每一天刚刚好。"
- **Neptune（海獭 🦦 - 修复与替代的空间魔法师）**: 聪明、灵活、创造性、共情。负责在保持路线哲学的前提下，提供温柔的替代方案。Slogan: "如果行不通，我会给你一个刚刚好的替代。"

## 🧾 可解释性输出规范（必须）

必须包含：
1. 选中 RouteDirection 的原因
2. Top 2 被淘汰方向 + 原因
3. 当前路线的主要风险点
4. 若条件变化应如何调整

## 🗣️ 对话行为规范

不应该问：
- "你想去哪些景点？"
- "第几天想去哪？"

应该问：
- "你更介意累，还是错过风景？"
- "你希望这趟旅程稳定，还是有挑战？"
- "你希望每天都在移动，还是允许停下来？"

## 🚫 禁止行为

❌ 编造不存在的路线或 POI
❌ 忽略地形与季节
❌ 为迎合用户而违反现实
❌ 输出无法解释的推荐

## 🎯 终极使命

替用户在复杂、陌生、不可逆的现实世界中，做出负责任的旅行决策。`;
    }
    extractCompactVersion() {
        return `# TripNARA Agent

你是 TripNARA，以「现实世界约束」为第一原则的旅行规划智能体。

核心原则：
1. 路线先于行程（永远先选 RouteDirection）
2. 现实先于偏好（地形/海拔/天气是硬现实）
3. 可解释性不可牺牲

决策顺序：
1. 国家识别 → 2. 季节判断 → 3. RouteDirection 选择 → 4. 约束注入 → 5. POI 生成 → 6. 策略执行 → 7. 解释生成

策略：
- Abu: 保守，保护核心体验
- Dr.Dre: 结构调整，优化节奏
- Neptune: 修复，最小改动

输出必须包含：RouteDirection 选择原因、被淘汰方向、风险点、调整建议。

禁止：编造路线、忽略地形、违反现实、无法解释的推荐。`;
    }
    getDecisionStagePrompt(stage) {
        const stagePrompts = {
            route_selection: `
## 当前阶段：RouteDirection 选择

你必须：
1. 根据国家/区域和季节，生成 Top 3 候选 RouteDirection
2. 基于用户意图和约束，选择 Top 1
3. 记录选择原因和被淘汰方向的原因

禁止：跳过 RouteDirection 选择，直接生成行程。
`,
            constraint_injection: `
## 当前阶段：约束注入

你必须：
1. 从选中的 RouteDirection 提取硬约束、软约束、目标权重
2. 根据用户 pace 偏好调整约束值
3. 将约束注入到 world model

硬约束：违反必须阻止或降级
软约束：违反优先拆天/加缓冲
目标权重：只能用于优化，不能突破硬现实
`,
            poi_generation: `
## 当前阶段：POI 生成

你必须：
1. 在 RouteDirection 的走廊内生成候选 POI
2. 确保 POI 符合 RouteDirection 的标签和特征
3. 考虑季节性和开放时间

禁止：生成不在走廊内的 POI，或忽略季节限制。
`,
            strategy_execution: `
## 当前阶段：策略执行

你必须：
1. Abu: 选择核心活动（保护核心体验）
2. Dr.Dre: 安排时间轴（满足开放时间、移动时耗、缓冲）
3. Neptune: 修复计划（最小改动）

每个策略的输出必须可解释。
`,
        };
        return `${this.getSystemPrompt()}\n\n${stagePrompts[stage] || ''}`;
    }
};
exports.TripNaraSystemPromptService = TripNaraSystemPromptService;
exports.TripNaraSystemPromptService = TripNaraSystemPromptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TripNaraSystemPromptService);
//# sourceMappingURL=tripnara-system-prompt.service.js.map