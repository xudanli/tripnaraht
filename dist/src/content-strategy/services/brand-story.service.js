"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BrandStoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandStoryService = void 0;
const common_1 = require("@nestjs/common");
let BrandStoryService = BrandStoryService_1 = class BrandStoryService {
    constructor() {
        this.logger = new common_1.Logger(BrandStoryService_1.name);
    }
    getBrandCoreStory() {
        return {
            problem: '旅行产品太多，决策太难',
            character: '一个30多岁的上班族，想去日本，但不知道去哪里',
            conflict: 'OTA告诉他"去京都"，攻略说"避开人流"，朋友说"去北海道"',
            turningPoint: '他用TripNARA来判断',
            result: '他根据自己的时间、体力、需求，做出了自己满意的决定',
            revelation: '好的旅行，不是被推荐出来的，而是被判断出来的',
        };
    }
    useBrandStory(context) {
        const coreStory = this.getBrandCoreStory();
        switch (context) {
            case 'first_screen':
                return this.generateFirstScreenStory(coreStory);
            case 'copy_example':
                return this.generateCopyExampleStory(coreStory);
            case 'user_education':
                return this.generateUserEducationStory(coreStory);
            case 'onboarding':
                return this.generateOnboardingStory(coreStory);
            case 'encouragement':
                return this.generateEncouragementStory(coreStory);
            default:
                return this.generateDefaultStory(coreStory);
        }
    }
    getUserStoryMaterial(storyType) {
        switch (storyType) {
            case 'NEGATION_TO_ACCEPTANCE':
                return this.getNegationToAcceptanceStory();
            case 'RISK_TO_CAPABILITY':
                return this.getRiskToCapabilityStory();
            case 'DOUBT_TO_CONFIDENCE':
                return this.getDoubtToConfidenceStory();
            case 'FEAR_TO_COURAGE':
                return this.getFearToCourageStory();
            case 'FAILURE_TO_LEARNING':
                return this.getFailureToLearningStory();
            default:
                return this.getDefaultUserStory();
        }
    }
    getAllUserStoryMaterials() {
        const storyTypes = [
            'NEGATION_TO_ACCEPTANCE',
            'RISK_TO_CAPABILITY',
            'DOUBT_TO_CONFIDENCE',
            'FEAR_TO_COURAGE',
            'FAILURE_TO_LEARNING',
        ];
        return storyTypes.map((type, index) => ({
            id: `story-${index + 1}`,
            story: this.getUserStoryMaterial(type),
            tags: this.extractTags(type),
            usageCount: 0,
        }));
    }
    generateStoryForContext(options) {
        const userStory = this.selectRelevantStory(options);
        return this.adaptStoryForContext(userStory, options);
    }
    generateFirstScreenStory(coreStory) {
        return `「判断，而非规划」

${coreStory.problem}

${coreStory.character}，${coreStory.conflict}

${coreStory.turningPoint}，${coreStory.result}

${coreStory.revelation}

开始了解`;
    }
    generateCopyExampleStory(coreStory) {
        return `品牌故事示例：

${coreStory.character}的故事

问题：${coreStory.problem}
冲突：${coreStory.conflict}
转折：${coreStory.turningPoint}
结果：${coreStory.result}

启示：${coreStory.revelation}`;
    }
    generateUserEducationStory(coreStory) {
        return `让我们通过一个故事来理解TripNARA的理念：

${coreStory.character}

他面临的问题是：${coreStory.problem}

他遇到的冲突是：${coreStory.conflict}

转折点是：${coreStory.turningPoint}

最终结果是：${coreStory.result}

这个故事告诉我们：${coreStory.revelation}`;
    }
    generateOnboardingStory(coreStory) {
        return `欢迎来到TripNARA。

${coreStory.revelation}

我们相信，${coreStory.problem}

通过${coreStory.turningPoint}，你可以${coreStory.result}

让我们开始你的判断之旅。`;
    }
    generateEncouragementStory(coreStory) {
        return `记住：${coreStory.revelation}

就像${coreStory.character}一样，${coreStory.turningPoint}，最终${coreStory.result}

你也可以做到。`;
    }
    generateDefaultStory(coreStory) {
        return `${coreStory.revelation}

${coreStory.problem} ${coreStory.character}，${coreStory.conflict}

${coreStory.turningPoint}，${coreStory.result}`;
    }
    getNegationToAcceptanceStory() {
        return {
            type: 'NEGATION_TO_ACCEPTANCE',
            title: '从否定到接受',
            content: `用户A的故事：

一开始，她对TripNARA很怀疑。
"为什么不直接告诉我哪条路线最好？"

但当她经历了完整的判断过程后，她说：
"我原来以为我想去稻城亚丁。
但通过你的数据，我发现我实际上更适合青海湖。
如果你一开始就推荐青海湖，我会拒绝。
但因为我自己判断出来，我现在真的很期待。"

这说明了什么？
同样的建议，被推荐和自己判断的接受度完全不同。`,
            keyPoints: [
                '用户初始怀疑是正常的',
                '通过数据帮助用户自己判断',
                '自己判断的结果更容易被接受',
                '判断过程本身就有价值',
            ],
            applicableScenarios: ['user_education', 'onboarding', 'encouragement'],
        };
    }
    getRiskToCapabilityStory() {
        return {
            type: 'RISK_TO_CAPABILITY',
            title: '从风险到能力',
            content: `用户B的故事：

他一开始很担心高反风险。
"我从来没有去过高原，我担心我做不到。"

我们告诉他：
"高反是真实的风险，但也是可以准备的。
如果你能做到这些准备，风险就在可控范围。
这不是说'有什么风险'，而是说'你需要什么准备'。"

他按照建议做了准备，最终成功完成了旅程。
他说："我原来以为风险是不可控的，但现在我知道，通过准备，我可以应对。"

这说明了什么？
风险不是用来恐吓的，而是用来赋能用户的。`,
            keyPoints: [
                '风险是真实的，但可以准备',
                '从"有什么风险"到"需要什么准备"',
                '通过准备，风险变得可控',
                '赋能用户，而非恐吓用户',
            ],
            applicableScenarios: ['user_education', 'encouragement', 'copy_example'],
        };
    }
    getDoubtToConfidenceStory() {
        return {
            type: 'DOUBT_TO_CONFIDENCE',
            title: '从怀疑到信心',
            content: `用户C的故事：

她对自己的判断能力很怀疑。
"我不确定我的决定是否正确。"

我们告诉她：
"没有完美的决定，只有最适合你的决定。
我们会提供客观的信息，帮助你做出判断。
但最终的决定权在你手中。"

通过我们的支持，她逐渐建立了信心。
她说："我原来以为我需要别人告诉我该做什么，但现在我知道，我有能力做出自己的判断。"

这说明了什么？
我们的目标是赋能用户，而不是替代用户做决定。`,
            keyPoints: [
                '没有完美的决定，只有最适合的决定',
                '提供客观信息，支持用户判断',
                '用户有能力做出自己的判断',
                '赋能而非替代',
            ],
            applicableScenarios: ['user_education', 'encouragement', 'onboarding'],
        };
    }
    getFearToCourageStory() {
        return {
            type: 'FEAR_TO_COURAGE',
            title: '从恐惧到勇气',
            content: `用户D的故事：

他害怕独自旅行。
"我一个人去，会不会很孤独？会不会不安全？"

我们理解他的担忧，并告诉他：
"独自旅行并不意味着孤独。
实际上，它可能带来意想不到的相遇和体验。
我们会帮你做好充分的准备，让你安心出发。"

他最终决定独自出发，回来后说：
"这是我做过的最勇敢的决定，也是我最难忘的旅行。
我遇到了很多有趣的人，也发现了自己的勇气。"

这说明了什么？
恐惧是正常的，但通过准备和支持，我们可以克服恐惧。`,
            keyPoints: [
                '恐惧是正常的',
                '独自旅行不等于孤独',
                '充分的准备带来安心',
                '勇气来自于准备和支持',
            ],
            applicableScenarios: ['encouragement', 'user_education', 'copy_example'],
        };
    }
    getFailureToLearningStory() {
        return {
            type: 'FAILURE_TO_LEARNING',
            title: '从失败到学习',
            content: `用户E的故事：

他第一次规划旅行时，遇到了很多问题。
"我的行程安排不合理，有些地方去不了。"

我们没有责怪他，而是帮助他分析：
"这不是失败，这是学习的过程。
让我们看看哪里可以改进，下次你会做得更好。"

通过这次经历，他学到了很多。
他说："我原来以为失败是坏事，但现在我知道，失败是学习的机会。
下次我会更好地利用TripNARA的功能，做出更好的判断。"

这说明了什么？
失败不是终点，而是学习的起点。`,
            keyPoints: [
                '失败是学习的过程',
                '从失败中学习，改进下次',
                '支持用户，而非责怪用户',
                '每次经历都是成长的机会',
            ],
            applicableScenarios: ['user_education', 'encouragement', 'copy_example'],
        };
    }
    getDefaultUserStory() {
        return {
            type: 'NEGATION_TO_ACCEPTANCE',
            title: '用户故事',
            content: '通过TripNARA，用户能够做出更好的旅行决策。',
            keyPoints: ['判断而非推荐', '数据驱动', '用户自主'],
            applicableScenarios: ['user_education'],
        };
    }
    extractTags(storyType) {
        const tagMap = {
            NEGATION_TO_ACCEPTANCE: ['接受', '判断', '信任'],
            RISK_TO_CAPABILITY: ['风险', '能力', '准备'],
            DOUBT_TO_CONFIDENCE: ['怀疑', '信心', '赋能'],
            FEAR_TO_COURAGE: ['恐惧', '勇气', '支持'],
            FAILURE_TO_LEARNING: ['失败', '学习', '成长'],
        };
        return tagMap[storyType] || [];
    }
    selectRelevantStory(options) {
        const storyTypes = [
            'NEGATION_TO_ACCEPTANCE',
            'RISK_TO_CAPABILITY',
            'DOUBT_TO_CONFIDENCE',
            'FEAR_TO_COURAGE',
            'FAILURE_TO_LEARNING',
        ];
        let selectedType = 'NEGATION_TO_ACCEPTANCE';
        if (options.context === 'encouragement') {
            selectedType = 'FEAR_TO_COURAGE';
        }
        else if (options.context === 'user_education') {
            selectedType = 'RISK_TO_CAPABILITY';
        }
        return this.getUserStoryMaterial(selectedType);
    }
    adaptStoryForContext(story, options) {
        let adaptedContent = story.content;
        if (options.length === 'SHORT') {
            adaptedContent = story.content.split('\n\n')[0] || story.content;
        }
        else if (options.length === 'LONG') {
            adaptedContent = `${story.content}\n\n关键点：\n${story.keyPoints.map(p => `- ${p}`).join('\n')}`;
        }
        return adaptedContent;
    }
};
exports.BrandStoryService = BrandStoryService;
exports.BrandStoryService = BrandStoryService = BrandStoryService_1 = __decorate([
    (0, common_1.Injectable)()
], BrandStoryService);
//# sourceMappingURL=brand-story.service.js.map