"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CopyExampleLibraryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopyExampleLibraryService = void 0;
const common_1 = require("@nestjs/common");
let CopyExampleLibraryService = CopyExampleLibraryService_1 = class CopyExampleLibraryService {
    constructor() {
        this.logger = new common_1.Logger(CopyExampleLibraryService_1.name);
    }
    getFirstTimeUserCopy() {
        return {
            firstScreenCopy: `「判断，而非规划」

你想去一个地方吗？
但你不确定这是不是现在最好的选择。

TripNARA帮你看清：
- 这个地方现在什么样
- 它对你意味着什么
- 你需要什么准备

不是让你听别人说好，
而是让你自己判断值不值得。

开始了解`,
            firstQuestion: '你想去哪里？',
            guidance: [
                '告诉我们你的想法，我们会帮你找到最适合的路线',
                '你可以随时调整你的偏好和需求',
                '我们会提供客观的信息，帮助你做出判断',
            ],
        };
    }
    getRouteComparisonCopy(routes) {
        const routeComparisons = routes.map(route => ({
            name: route.nameCN || route.name,
            strengths: this.extractStrengths(route),
            considerations: this.extractConsiderations(route),
        }));
        return {
            comparison: {
                routes: routeComparisons,
                summary: this.generateComparisonSummary(routes),
            },
            suggestion: {
                message: '每条路线都有其独特之处，关键是要找到最适合你的。',
                reflection: [
                    '你最看重的是什么？是体验、安全，还是挑战？',
                    '你的时间和预算是否允许？',
                    '你是否有足够的准备来应对潜在的挑战？',
                ],
            },
        };
    }
    getLonelinessConcernCopy() {
        return {
            empathy: '我们理解你对独自旅行的担忧。这很正常，很多人都有这样的顾虑。',
            clarification: '独自旅行并不意味着孤独。实际上，它可能带来意想不到的相遇和体验。',
            socialOpportunities: [
                '旅途中会遇到很多志同道合的旅行者',
                '可以选择住在青年旅舍或参加当地活动，增加社交机会',
                '独自旅行让你更自由地探索，也更容易与当地人交流',
                '很多独自旅行的人都表示，这是他们最难忘的体验之一',
            ],
        };
    }
    getWeatherRiskCopy(weatherRisk) {
        return {
            situation: `这个季节天气变化较快，${weatherRisk.description}`,
            possibilities: [
                '可能出现降雨或恶劣天气',
                '天气可能影响部分行程安排',
                '需要准备应对恶劣天气的装备',
            ],
            preparations: [
                '关注天气预报，提前了解天气变化',
                '准备雨具和保暖衣物',
                '了解当地天气模式，做好心理准备',
                '准备备用方案，灵活调整行程',
            ],
            empowerment: weatherRisk.level === 'CRITICAL'
                ? '这个风险需要特别重视，建议重新评估是否适合前往'
                : weatherRisk.level === 'HIGH'
                    ? '如果你能做到充分准备，风险可以在可控范围内'
                    : '通过适当的准备和注意，你可以应对这个风险',
        };
    }
    getPhysicalRiskCopy(physicalRisk) {
        return `这条路线的体力要求是${physicalRisk.level}。根据你的情况，我们建议：

${physicalRisk.requirements.map(req => `- ${req}`).join('\n')}

如果你现在去，可能会遇到一些挑战。但如果你能提前做好准备，这些挑战是可以克服的。

我们希望你成功，而不是让你去冒险。`;
    }
    getBudgetConcernCopy(budgetInfo) {
        const ratio = budgetInfo.estimatedCost / budgetInfo.userBudget;
        if (ratio > 1.2) {
            return `这条路线的预计费用（${budgetInfo.estimatedCost}元）超出了你的预算（${budgetInfo.userBudget}元）。

我们理解预算的重要性。你可以考虑：
- 寻找更经济的替代方案
- 调整行程安排，减少部分费用
- 推迟出发，给自己更多时间准备预算

我们希望你能在预算范围内获得最好的体验。`;
        }
        else if (ratio > 1.0) {
            return `这条路线的预计费用（${budgetInfo.estimatedCost}元）略高于你的预算（${budgetInfo.userBudget}元），但差距不大。

你可以考虑：
- 准备一些应急资金
- 寻找节省开支的方法
- 调整部分行程安排

如果预算允许，这条路线的体验是值得的。`;
        }
        else {
            return `这条路线的预计费用（${budgetInfo.estimatedCost}元）在你的预算范围内（${budgetInfo.userBudget}元）。

你可以放心规划，还有一定的预算空间可以用于其他体验。`;
        }
    }
    getTimeConstraintCopy(timeInfo) {
        if (timeInfo.tight) {
            return `这条路线的预计时长是${timeInfo.routeDuration}天，而你有${timeInfo.availableDays}天可用。

时间比较紧张，但如果你能合理安排，还是可以完成的。建议：
- 提前规划好每天的行程
- 准备一些可以灵活调整的活动
- 了解哪些活动是必须的，哪些可以省略

记住，旅行的质量比数量更重要。`;
        }
        else {
            return `这条路线的预计时长是${timeInfo.routeDuration}天，而你有${timeInfo.availableDays}天可用。

时间充足，你可以：
- 放慢节奏，更好地享受旅程
- 增加一些额外的探索
- 给自己更多休息和调整的时间

这是一个很好的时间安排。`;
        }
    }
    getDecisionHesitationCopy() {
        return `我们理解你的犹豫。做出旅行决定并不容易，这是正常的。

让我们帮你理清思路：
- 你最担心的是什么？
- 你最期待的是什么？
- 如果不去，你会后悔吗？

记住，没有完美的决定，只有最适合你的决定。我们会提供客观的信息，帮助你做出判断。`;
    }
    getSuccessConfirmationCopy() {
        return `很好！你已经做出了决定。让我们开始准备吧。

接下来我们会：
- 帮你确认行程细节
- 提供准备清单
- 支持你完成这次旅行

记住，我们一直在你身边，随时为你提供支持。`;
    }
    getRejectionResponseCopy(reason) {
        return `理解你的决定。有时候不出发也是明智的选择。

${reason}

我们会继续帮助你找到最适合的路线。做出适合自己的决定是最重要的。`;
    }
    getSystemErrorCopy(error) {
        return {
            title: '系统暂时出现问题',
            description: '抱歉，系统遇到了一个临时问题。我们正在努力解决。',
            possibleReasons: [
                '服务器正在维护',
                '系统负载过高',
                '临时技术故障',
            ],
            suggestions: [
                '请稍后再试',
                '刷新页面',
                '如果问题持续，请联系技术支持',
            ],
            supportInfo: '如果问题持续存在，请通过客服渠道联系我们。',
        };
    }
    getNetworkErrorCopy() {
        return {
            title: '网络连接问题',
            description: '无法连接到服务器，请检查你的网络连接。',
            possibleReasons: [
                '网络连接不稳定',
                'WiFi信号较弱',
                '移动数据网络问题',
            ],
            suggestions: [
                '检查网络连接',
                '尝试切换到其他网络',
                '刷新页面重试',
            ],
        };
    }
    getDataNotFoundCopy(dataType) {
        return {
            title: '未找到相关信息',
            description: `抱歉，我们暂时无法找到你请求的${dataType}信息。`,
            possibleReasons: [
                '数据可能正在更新',
                '请求的信息不存在',
                '搜索条件过于严格',
            ],
            suggestions: [
                '尝试调整搜索条件',
                '稍后再试',
                '联系客服获取帮助',
            ],
        };
    }
    getValidationErrorCopy(field) {
        return {
            title: '输入信息有误',
            description: `请检查${field}的输入是否正确。`,
            possibleReasons: [
                '输入格式不正确',
                '必填字段未填写',
                '输入值超出允许范围',
            ],
            suggestions: [
                '检查输入格式',
                '确保所有必填字段都已填写',
                '参考提示信息进行修正',
            ],
        };
    }
    getPermissionDeniedCopy() {
        return {
            title: '权限不足',
            description: '你没有权限执行此操作。',
            possibleReasons: [
                '需要登录',
                '账户权限不足',
                '操作需要特殊权限',
            ],
            suggestions: [
                '请先登录',
                '检查账户权限',
                '联系管理员获取权限',
            ],
        };
    }
    getTimeoutErrorCopy() {
        return {
            title: '请求超时',
            description: '请求处理时间过长，请稍后再试。',
            possibleReasons: [
                '服务器响应较慢',
                '网络延迟较高',
                '请求数据量较大',
            ],
            suggestions: [
                '稍后再试',
                '检查网络连接',
                '尝试简化请求',
            ],
        };
    }
    getRateLimitCopy() {
        return {
            title: '请求过于频繁',
            description: '你的请求过于频繁，请稍后再试。',
            possibleReasons: [
                '短时间内请求次数过多',
                '触发了系统保护机制',
            ],
            suggestions: [
                '请稍后再试',
                '减少请求频率',
                '如果持续出现，请联系技术支持',
            ],
        };
    }
    getMaintenanceCopy() {
        return {
            title: '系统维护中',
            description: '系统正在维护，预计很快恢复。',
            possibleReasons: [
                '定期系统维护',
                '功能更新',
                '性能优化',
            ],
            suggestions: [
                '请稍后再试',
                '关注系统公告',
                '如有紧急需求，请联系客服',
            ],
            supportInfo: '维护期间如有紧急需求，请联系客服。',
        };
    }
    getErrorCopy(errorType, context) {
        switch (errorType) {
            case 'SYSTEM_ERROR':
                return this.getSystemErrorCopy(context || {});
            case 'NETWORK_ERROR':
                return this.getNetworkErrorCopy();
            case 'DATA_NOT_FOUND':
                return this.getDataNotFoundCopy((context === null || context === void 0 ? void 0 : context.dataType) || '数据');
            case 'VALIDATION_ERROR':
                return this.getValidationErrorCopy((context === null || context === void 0 ? void 0 : context.field) || '输入');
            case 'PERMISSION_DENIED':
                return this.getPermissionDeniedCopy();
            case 'TIMEOUT_ERROR':
                return this.getTimeoutErrorCopy();
            case 'RATE_LIMIT':
                return this.getRateLimitCopy();
            case 'MAINTENANCE':
                return this.getMaintenanceCopy();
            default:
                return {
                    title: '出现错误',
                    description: '抱歉，出现了意外错误。',
                    possibleReasons: ['未知错误'],
                    suggestions: ['请稍后再试', '如果问题持续，请联系技术支持'],
                };
        }
    }
    getDataMissingException(dataType) {
        return {
            type: 'DATA_MISSING',
            userFriendlyMessage: `我们暂时无法获取${dataType}的完整信息。`,
            technicalDetails: `数据源缺失：${dataType}`,
            nextSteps: [
                '使用现有信息进行判断',
                '稍后刷新获取最新数据',
                '联系客服获取帮助',
            ],
        };
    }
    getValidationException(field, reason) {
        return {
            type: 'VALIDATION_FAILED',
            userFriendlyMessage: `请检查${field}的输入：${reason}`,
            technicalDetails: `验证失败：${field} - ${reason}`,
            nextSteps: [
                '检查输入格式',
                '参考提示信息修正',
                '如有疑问，联系客服',
            ],
        };
    }
    getBusinessLogicException(message) {
        return {
            type: 'BUSINESS_LOGIC_ERROR',
            userFriendlyMessage: message,
            nextSteps: [
                '检查操作是否符合要求',
                '参考帮助文档',
                '联系客服获取支持',
            ],
        };
    }
    extractStrengths(route) {
        var _a;
        const strengths = [];
        if (route.tags && route.tags.length > 0) {
            strengths.push(`特色：${route.tags.slice(0, 3).join('、')}`);
        }
        if ((_a = route.seasonality) === null || _a === void 0 ? void 0 : _a.bestMonths) {
            const currentMonth = new Date().getMonth() + 1;
            if (route.seasonality.bestMonths.includes(currentMonth)) {
                strengths.push('当前处于最佳旅行季节');
            }
        }
        if (route.description) {
            strengths.push('体验丰富');
        }
        return strengths.length > 0 ? strengths : ['值得探索的路线'];
    }
    extractConsiderations(route) {
        var _a, _b, _c;
        const considerations = [];
        if ((_a = route.constraints) === null || _a === void 0 ? void 0 : _a.requiresPermit) {
            considerations.push('需要提前申请许可');
        }
        if ((_b = route.riskProfile) === null || _b === void 0 ? void 0 : _b.altitudeSickness) {
            considerations.push('需要注意高反风险');
        }
        if ((_c = route.riskProfile) === null || _c === void 0 ? void 0 : _c.weatherWindow) {
            considerations.push('受天气窗口限制');
        }
        return considerations;
    }
    generateComparisonSummary(routes) {
        if (routes.length === 0) {
            return '暂无路线可对比';
        }
        if (routes.length === 1) {
            return `这是你选择的路线：${routes[0].nameCN || routes[0].name}`;
        }
        return `你正在比较${routes.length}条路线。每条路线都有其独特之处，关键是要找到最适合你的。`;
    }
};
exports.CopyExampleLibraryService = CopyExampleLibraryService;
exports.CopyExampleLibraryService = CopyExampleLibraryService = CopyExampleLibraryService_1 = __decorate([
    (0, common_1.Injectable)()
], CopyExampleLibraryService);
//# sourceMappingURL=copy-example-library.service.js.map