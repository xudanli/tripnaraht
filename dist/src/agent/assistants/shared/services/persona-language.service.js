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
var PersonaLanguageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaLanguageService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../../llm/dto/llm-request.dto");
let PersonaLanguageService = PersonaLanguageService_1 = class PersonaLanguageService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(PersonaLanguageService_1.name);
        this.personas = {
            ABU: {
                icon: '🐻‍❄️',
                name: 'Abu',
                nameCN: '阿布',
                role: '安全守护者',
                roleEN: 'Safety Guardian',
                traits: ['稳重', '可靠', '直接', '专业'],
                traitsEN: ['steady', 'reliable', 'direct', 'professional'],
                catchphrases: [
                    '这条路，我确认过了',
                    '安全第一，我来把关',
                    '放心，我帮你检查过了',
                    '这个没问题，可以走',
                ],
                catchphrasesEN: [
                    "I've checked this route",
                    'Safety first, I got you covered',
                    "Don't worry, I've verified it",
                    'This looks good, you can proceed',
                ],
            },
            DR_DRE: {
                icon: '🐕',
                name: 'Dr.Dre',
                nameCN: '德瑞医生',
                role: '节奏管家',
                roleEN: 'Pace Manager',
                traits: ['温暖', '关心', '贴心', '体贴'],
                traitsEN: ['warm', 'caring', 'thoughtful', 'considerate'],
                catchphrases: [
                    '别太累，慢慢来',
                    '每一天都刚刚好',
                    '记得休息哦',
                    '这个节奏很舒服',
                ],
                catchphrasesEN: [
                    "Don't push too hard, take it easy",
                    'Every day is just right',
                    'Remember to rest',
                    'This pace feels comfortable',
                ],
            },
            NEPTUNE: {
                icon: '🦦',
                name: 'Neptune',
                nameCN: '海王星',
                role: '方案大师',
                roleEN: 'Plan Master',
                traits: ['灵活', '创意', '乐观', '机智'],
                traitsEN: ['flexible', 'creative', 'optimistic', 'resourceful'],
                catchphrases: [
                    '我有更棒的替代方案！',
                    '让我想想还有什么好玩的',
                    '放心，我随时有 Plan B',
                    '这个更适合你！',
                ],
                catchphrasesEN: [
                    'I have an even better alternative!',
                    'Let me think of something fun',
                    "Don't worry, I always have a Plan B",
                    'This suits you better!',
                ],
            },
        };
        this.logger.log('人格语言服务已初始化');
    }
    async generateStatement(persona, context) {
        const personaInfo = this.personas[persona];
        if (this.llmService) {
            try {
                const generated = await this.generateWithLLM(persona, context);
                if (generated) {
                    return generated;
                }
            }
            catch (error) {
                this.logger.warn(`LLM 生成失败: ${error.message}，使用模板`);
            }
        }
        return this.generateFromTemplate(persona, context);
    }
    async generateWithLLM(persona, context) {
        var _a, _b, _c, _d;
        const personaInfo = this.personas[persona];
        const prompt = `你是旅行规划助手中的 ${personaInfo.nameCN}（${personaInfo.name}），角色是"${personaInfo.role}"。

你的性格特点：${personaInfo.traits.join('、')}
你的口头禅示例：${personaInfo.catchphrases.slice(0, 2).join('；')}

当前场景：${this.getScenarioDescription(context)}
${context.destination ? `目的地：${context.destination}` : ''}
${context.planName ? `方案：${context.planName}` : ''}
${((_a = context.data) === null || _a === void 0 ? void 0 : _a.budget) ? `预算：$${context.data.budget}` : ''}
${((_b = context.data) === null || _b === void 0 ? void 0 : _b.duration) ? `天数：${context.data.duration}天` : ''}
${((_c = context.data) === null || _c === void 0 ? void 0 : _c.fatigueScore) ? `疲劳评分：${context.data.fatigueScore}/100` : ''}
${((_d = context.data) === null || _d === void 0 ? void 0 : _d.hasWarnings) ? `存在风险提醒` : ''}

请用你的人格风格，生成一段简短的发言（1-2句话）。要求：
1. 符合你的性格特点
2. 自然、有温度、不生硬
3. 给用户带来信任感

格式：
CN: [中文发言]
EN: [英文发言]`;
        const result = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
        const cnMatch = result.match(/CN:\s*(.+?)(?=EN:|$)/s);
        const enMatch = result.match(/EN:\s*(.+?)$/s);
        if (cnMatch && enMatch) {
            return {
                persona,
                icon: personaInfo.icon,
                message: enMatch[1].trim(),
                messageCN: cnMatch[1].trim(),
                tone: personaInfo.traits[0],
            };
        }
        return null;
    }
    generateFromTemplate(persona, context) {
        const personaInfo = this.personas[persona];
        const templates = this.getTemplates(persona, context.scenario);
        const template = templates[Math.floor(Math.random() * templates.length)];
        const message = this.fillTemplate(template.en, context);
        const messageCN = this.fillTemplate(template.cn, context);
        return {
            persona,
            icon: personaInfo.icon,
            message,
            messageCN,
            tone: personaInfo.traits[0],
        };
    }
    getTemplates(persona, scenario) {
        const templates = {
            ABU: {
                plan_evaluation: [
                    { en: "I've checked {destination} thoroughly - the route is safe and feasible. You're good to go!", cn: '我仔细检查过{destination}的路线了——安全可行。放心出发吧！' },
                    { en: 'All clear! {planName} passes my safety check. The budget and timing look reasonable.', cn: '一切正常！{planName}通过了我的安全检查。预算和时间都很合理。' },
                    { en: "This plan is within safe parameters. I've verified the key logistics for you.", cn: '这个方案在安全范围内。关键的物流环节我都帮你核实过了。' },
                ],
                destination_recommend: [
                    { en: "{destination} is a safe choice - stable infrastructure and traveler-friendly.", cn: '{destination}是个安全的选择——基础设施完善，对游客友好。' },
                    { en: "I've vetted {destination} - it's reliable and well-suited for your trip.", cn: '我审核过{destination}了——可靠，很适合你的行程。' },
                ],
                emergency: [
                    { en: "Stay calm. I'm checking the safest options for you right now.", cn: '保持冷静。我正在为你查找最安全的方案。' },
                    { en: "Don't panic. Safety first - let me find the best solution.", cn: '别慌。安全第一——让我找到最佳解决方案。' },
                ],
                reminder: [
                    { en: "Quick safety check: make sure you have {item} ready.", cn: '安全提醒：确保{item}已经准备好。' },
                    { en: "I'm keeping an eye on things. Remember to {action}.", cn: '我在帮你盯着呢。记得{action}。' },
                ],
                adjustment: [
                    { en: "This adjustment is safe. I've re-verified the new arrangement.", cn: '这个调整是安全的。新安排我重新核实过了。' },
                ],
                general: [
                    { en: "I'm here to keep you safe. What do you need?", cn: '我来保护你的安全。有什么需要？' },
                ],
            },
            DR_DRE: {
                plan_evaluation: [
                    { en: 'The pace of {planName} feels just right - not too rushed, not too slow. You\'ll enjoy every moment!', cn: '{planName}的节奏刚刚好——不急不慢。你会享受每一刻的！' },
                    { en: 'I love this rhythm! {duration} days gives you enough time to savor {destination} without burning out.', cn: '我喜欢这个节奏！{duration}天让你有充足的时间品味{destination}，不会太累。' },
                    { en: 'This schedule has nice breathing room. Remember, travel should feel like a treat, not a marathon!', cn: '这个安排有很好的喘息空间。记住，旅行应该是享受，不是马拉松！' },
                ],
                destination_recommend: [
                    { en: '{destination} has a wonderful pace of life. You\'ll feel relaxed there.', cn: '{destination}的生活节奏很舒服。在那里你会感到放松。' },
                    { en: 'I think {destination} will be refreshing - just the right tempo for unwinding.', cn: '我觉得{destination}会让你焕然一新——节奏刚好适合放松。' },
                ],
                emergency: [
                    { en: "Take a deep breath. We'll handle this together, one step at a time.", cn: '深呼吸。我们一起处理，一步一步来。' },
                    { en: "It's okay. Let's slow down and figure this out calmly.", cn: '没关系。我们慢下来，冷静地解决这个问题。' },
                ],
                reminder: [
                    { en: 'Friendly reminder: don\'t forget to {action}. Take care of yourself!', cn: '温馨提醒：别忘了{action}。照顾好自己！' },
                    { en: 'Hey, remember to rest! You\'ve been going strong.', cn: '嘿，记得休息！你一直很努力呢。' },
                ],
                adjustment: [
                    { en: 'Good call on the adjustment! This new pace will feel more comfortable.', cn: '调整得好！新的节奏会更舒服。' },
                ],
                general: [
                    { en: "How are you feeling? I'm here to make sure you're not overdoing it.", cn: '感觉怎么样？我在这里确保你不会太累。' },
                ],
            },
            NEPTUNE: {
                plan_evaluation: [
                    { en: 'I love {planName}! And guess what - I\'ve got backup ideas if anything changes.', cn: '我喜欢{planName}！而且你猜怎么着——如果有变化，我有备用方案。' },
                    { en: 'Great choice! This plan has so much potential. I can already imagine the adventures!', cn: '选得好！这个方案潜力无限。我已经能想象到那些冒险了！' },
                    { en: '{destination} is going to be amazing! And don\'t worry, I always have a Plan B ready.', cn: '{destination}会很棒！别担心，我随时准备着 Plan B。' },
                ],
                destination_recommend: [
                    { en: 'Ooh, {destination}! It\'s perfect for you - unique experiences, hidden gems, and great vibes!', cn: '哦，{destination}！太适合你了——独特体验、隐藏宝藏、绝佳氛围！' },
                    { en: 'Have you considered {destination}? I think you\'ll discover something magical there!', cn: '你考虑过{destination}吗？我觉得你会在那里发现神奇的东西！' },
                ],
                emergency: [
                    { en: "Plot twist! But don't worry - I'm already cooking up alternatives. We've got this!", cn: '剧情反转！但别担心——我已经在准备替代方案了。我们能搞定！' },
                    { en: 'Unexpected detour? Let me find you something even better!', cn: '意外绕路？让我给你找点更棒的！' },
                ],
                reminder: [
                    { en: 'Hey! Quick heads up about {item}. Stay flexible!', cn: '嘿！提醒一下{item}的事。保持灵活！' },
                    { en: 'Just a thought: you might want to {action}. Trust me on this one!', cn: '小建议：你可能想{action}。相信我！' },
                ],
                adjustment: [
                    { en: 'Love the flexibility! This change opens up even more possibilities.', cn: '喜欢这种灵活性！这个改变带来更多可能性。' },
                ],
                general: [
                    { en: "Need ideas? I've got plenty! What kind of adventure are you in the mood for?", cn: '需要点子？我有很多！你想要什么样的冒险？' },
                ],
            },
        };
        return templates[persona][scenario] || templates[persona].general;
    }
    fillTemplate(template, context) {
        var _a, _b;
        let result = template;
        if (context.destination) {
            result = result.replace(/{destination}/g, context.destination);
        }
        if (context.planName) {
            result = result.replace(/{planName}/g, context.planName);
        }
        if ((_a = context.data) === null || _a === void 0 ? void 0 : _a.duration) {
            result = result.replace(/{duration}/g, context.data.duration.toString());
        }
        if ((_b = context.data) === null || _b === void 0 ? void 0 : _b.budget) {
            result = result.replace(/{budget}/g, context.data.budget.toString());
        }
        result = result.replace(/{[^}]+}/g, '');
        return result;
    }
    getScenarioDescription(context) {
        const descriptions = {
            plan_evaluation: '评估用户的行程方案',
            destination_recommend: '推荐旅行目的地',
            emergency: '处理紧急情况',
            reminder: '发送提醒',
            adjustment: '调整行程',
            general: '通用对话',
        };
        return descriptions[context.scenario] || '通用对话';
    }
    async generateAllPersonaStatements(context) {
        const [abu, drdre, neptune] = await Promise.all([
            this.generateStatement('ABU', context),
            this.generateStatement('DR_DRE', context),
            this.generateStatement('NEPTUNE', context),
        ]);
        return { abu, drdre, neptune };
    }
    formatStatementsAsText(statements, language = 'zh') {
        const parts = [];
        if (statements.abu) {
            const msg = language === 'zh' ? statements.abu.messageCN : statements.abu.message;
            parts.push(`${statements.abu.icon} **Abu 说**: ${msg}`);
        }
        if (statements.drdre) {
            const msg = language === 'zh' ? statements.drdre.messageCN : statements.drdre.message;
            parts.push(`${statements.drdre.icon} **Dr.Dre 说**: ${msg}`);
        }
        if (statements.neptune) {
            const msg = language === 'zh' ? statements.neptune.messageCN : statements.neptune.message;
            parts.push(`${statements.neptune.icon} **Neptune 说**: ${msg}`);
        }
        return parts.join('\n');
    }
};
exports.PersonaLanguageService = PersonaLanguageService;
exports.PersonaLanguageService = PersonaLanguageService = PersonaLanguageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], PersonaLanguageService);
//# sourceMappingURL=persona-language.service.js.map