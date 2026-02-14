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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PromptService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const handlebars_1 = __importDefault(require("handlebars"));
let PromptService = PromptService_1 = class PromptService {
    constructor() {
        this.logger = new common_1.Logger(PromptService_1.name);
        this.promptCache = new Map();
        this.handlebars = handlebars_1.default.create();
        this.registerHelpers();
    }
    registerHelpers() {
    }
    async getPrompt(promptType, version = 'latest') {
        const cacheKey = `${promptType}:${version}`;
        if (this.promptCache.has(cacheKey)) {
            this.logger.debug(`[Prompt服务] 缓存命中: ${cacheKey}`);
            return this.promptCache.get(cacheKey);
        }
        const promptFile = this.getPromptFilePath(promptType, version);
        if (!fs.existsSync(promptFile)) {
            this.logger.warn(`[Prompt服务] Prompt文件不存在: ${promptFile}，使用默认版本`);
            const defaultFile = this.getPromptFilePath(promptType, 'v1.0');
            if (fs.existsSync(defaultFile)) {
                const content = fs.readFileSync(defaultFile, 'utf-8');
                const template = this.extractPromptContent(content);
                this.promptCache.set(cacheKey, template);
                return template;
            }
            throw new Error(`Prompt文件不存在: ${promptFile}`);
        }
        const content = fs.readFileSync(promptFile, 'utf-8');
        const template = this.extractPromptContent(content);
        this.promptCache.set(cacheKey, template);
        this.logger.debug(`[Prompt服务] Prompt加载成功: ${promptType}:${version}`);
        return template;
    }
    async renderPrompt(promptType, variables, version = 'latest') {
        const template = await this.getPrompt(promptType, version);
        const compiled = this.handlebars.compile(template);
        return compiled(variables);
    }
    getPromptFilePath(promptType, version) {
        const promptFileMap = {
            intent_analysis: 'intent-analysis',
            qa_enhancement: 'qa-enhancement',
            general_chat: 'general-chat',
        };
        const fileName = promptFileMap[promptType];
        const versionSuffix = version === 'latest' ? 'v1.0' : version;
        return path.join(process.cwd(), 'prompts', 'trip-planner', `${fileName}-${versionSuffix}.md`);
    }
    extractPromptContent(markdown) {
        const promptSectionMatch = markdown.match(/##\s+(?:Prompt内容|Prompt模板)\s*\n([\s\S]*?)(?=\n##\s+(?:输出格式要求|分析步骤|版本信息|角色设定|职责范围|Few-shot Examples|用途)|$)/);
        if (!promptSectionMatch) {
            let content = markdown.replace(/^---[\s\S]*?---\n/, '');
            content = content.replace(/^##\s+用途[\s\S]*?\n/, '');
            return content.trim();
        }
        let content = promptSectionMatch[1].trim();
        const examplesMatch = markdown.match(/##\s+Few-shot Examples\s*\n([\s\S]*?)(?=\n##|$)/);
        if (examplesMatch) {
            let examplesContent = examplesMatch[1].trim();
            examplesContent = examplesContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            examplesContent = examplesContent.replace(/###\s+示例\d+\s*\n/g, '示例：\n');
            content = `${content}\n\n## Few-shot Examples\n${examplesContent}`;
        }
        const outputFormatMatch = markdown.match(/##\s+输出格式要求\s*\n([\s\S]*?)(?=\n##|$)/);
        if (outputFormatMatch) {
            let formatContent = outputFormatMatch[1].trim();
            formatContent = formatContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            content = `${content}\n\n## 输出格式要求\n${formatContent}`;
        }
        const stepsMatch = markdown.match(/##\s+分析步骤\s*\n([\s\S]*?)(?=\n##|$)/);
        if (stepsMatch) {
            content = `${content}\n\n## 分析步骤\n${stepsMatch[1].trim()}`;
        }
        return content.trim();
    }
    clearCache() {
        this.promptCache.clear();
        this.logger.debug('[Prompt服务] 缓存已清除');
    }
    getCacheStats() {
        return {
            size: this.promptCache.size,
            keys: Array.from(this.promptCache.keys()),
        };
    }
};
exports.PromptService = PromptService;
exports.PromptService = PromptService = PromptService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PromptService);
//# sourceMappingURL=prompt.service.js.map