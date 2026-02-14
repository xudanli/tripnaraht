"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UserDecisionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDecisionService = void 0;
const common_1 = require("@nestjs/common");
let UserDecisionService = UserDecisionService_1 = class UserDecisionService {
    constructor() {
        this.logger = new common_1.Logger(UserDecisionService_1.name);
    }
    async processUserDecision(rule, userAnswers) {
        if (!rule.then.userDecision) {
            this.logger.debug(`规则 ${rule.id} 没有 userDecision，返回原始 Action`);
            return {
                updatedAction: rule.then,
                blockTrip: rule.then.level === 'blocker',
                nextQuestions: undefined,
            };
        }
        const { questions, branches, defaultBranch } = rule.then.userDecision;
        const missingAnswers = this.validateAnswers(questions, userAnswers);
        if (missingAnswers.length > 0) {
            this.logger.warn(`规则 ${rule.id} 缺少用户回答: ${missingAnswers.join(', ')}`);
            return {
                updatedAction: rule.then,
                blockTrip: false,
                nextQuestions: questions.filter(q => missingAnswers.includes(q.id)),
            };
        }
        for (const branch of branches || []) {
            if (this.evaluateBranchCondition(branch, userAnswers)) {
                this.logger.debug(`规则 ${rule.id} 匹配分支: ${JSON.stringify(branch.condition)}`);
                const branchAction = branch.then;
                const blockTrip = branchAction.blockTrip || false;
                const mergedAction = {
                    level: branchAction.level || rule.then.level,
                    message: branchAction.message || rule.then.message,
                    tasks: branchAction.tasks || rule.then.tasks,
                    userDecision: rule.then.userDecision,
                };
                if (blockTrip) {
                    mergedAction.level = 'blocker';
                }
                const nextQuestions = branchAction.additionalQuestions || undefined;
                if (nextQuestions && nextQuestions.length > 0) {
                    mergedAction.userDecision = {
                        ...rule.then.userDecision,
                        questions: [
                            ...questions,
                            ...nextQuestions,
                        ],
                    };
                }
                return {
                    updatedAction: mergedAction,
                    blockTrip,
                    nextQuestions,
                    matchedBranch: branch,
                };
            }
        }
        if (defaultBranch) {
            this.logger.debug(`规则 ${rule.id} 使用默认分支`);
            const blockTrip = defaultBranch.blockTrip || false;
            const updatedAction = {
                level: defaultBranch.level || rule.then.level,
                message: defaultBranch.message || rule.then.message,
                tasks: defaultBranch.tasks || rule.then.tasks,
                userDecision: rule.then.userDecision,
            };
            if (blockTrip) {
                updatedAction.level = 'blocker';
            }
            return {
                updatedAction,
                blockTrip,
                nextQuestions: undefined,
            };
        }
        this.logger.debug(`规则 ${rule.id} 没有匹配的分支和默认分支，返回原始 Action`);
        return {
            updatedAction: rule.then,
            blockTrip: rule.then.level === 'blocker',
            nextQuestions: undefined,
        };
    }
    validateAnswers(questions, userAnswers) {
        const missing = [];
        for (const question of questions) {
            if (!(question.id in userAnswers)) {
                missing.push(question.id);
            }
            else {
                const answer = userAnswers[question.id];
                if (!this.validateAnswerType(question, answer)) {
                    this.logger.warn(`问题 ${question.id} 的答案类型不匹配`);
                }
            }
        }
        return missing;
    }
    validateAnswerType(question, answer) {
        var _a, _b;
        switch (question.type) {
            case 'yes_no':
                return typeof answer === 'boolean';
            case 'single_choice':
                return typeof answer === 'string';
            case 'multiple_choice':
                return Array.isArray(answer) && answer.every(a => typeof a === 'string');
            case 'text':
                return typeof answer === 'string';
            case 'number':
                return typeof answer === 'number';
            case 'date':
                return typeof answer === 'string' && !isNaN(Date.parse(answer));
            case 'rating':
                const min = ((_a = question.validation) === null || _a === void 0 ? void 0 : _a.min) || 1;
                const max = ((_b = question.validation) === null || _b === void 0 ? void 0 : _b.max) || 5;
                return typeof answer === 'number' && answer >= min && answer <= max;
            default:
                return true;
        }
    }
    evaluateBranchCondition(branch, userAnswers) {
        const { questionId, operator, value } = branch.condition;
        const userAnswer = userAnswers[questionId];
        if (userAnswer === undefined) {
            return false;
        }
        return this.evaluateCondition(userAnswer, operator, value);
    }
    evaluateCondition(userAnswer, operator, expectedValue) {
        try {
            switch (operator) {
                case 'equals':
                    return userAnswer === expectedValue;
                case 'not_equals':
                    return userAnswer !== expectedValue;
                case 'contains':
                    if (Array.isArray(userAnswer)) {
                        return userAnswer.includes(expectedValue);
                    }
                    if (typeof userAnswer === 'string') {
                        return userAnswer.includes(expectedValue);
                    }
                    return false;
                case 'greater_than':
                    if (typeof userAnswer === 'number' && typeof expectedValue === 'number') {
                        return userAnswer > expectedValue;
                    }
                    return false;
                case 'less_than':
                    if (typeof userAnswer === 'number' && typeof expectedValue === 'number') {
                        return userAnswer < expectedValue;
                    }
                    return false;
                case 'in':
                    if (Array.isArray(expectedValue)) {
                        return expectedValue.includes(userAnswer);
                    }
                    return false;
                case 'not_in':
                    if (Array.isArray(expectedValue)) {
                        return !expectedValue.includes(userAnswer);
                    }
                    return false;
                default:
                    this.logger.warn(`未知的操作符: ${operator}`);
                    return false;
            }
        }
        catch (error) {
            this.logger.error(`评估条件时出错: ${error}`, error instanceof Error ? error.stack : undefined);
            return false;
        }
    }
    getQuestionsForRule(rule) {
        if (!rule.then.userDecision) {
            return [];
        }
        return rule.then.userDecision.questions || [];
    }
    requiresUserDecision(rule) {
        return !!(rule.then.userDecision &&
            rule.then.userDecision.questions &&
            rule.then.userDecision.questions.length > 0);
    }
    getQuestionGroups(rule, answeredQuestionIds = []) {
        if (!rule.then.userDecision || !rule.then.userDecision.questions) {
            return {
                groups: [],
                totalQuestions: 0,
                answeredQuestions: 0,
                overallProgress: 0,
                currentGroupIndex: 0,
            };
        }
        const questions = rule.then.userDecision.questions;
        const groups = rule.then.userDecision.groups || [];
        const questionGroups = groups.length > 0
            ? groups.map((group) => ({
                ...group,
                questions: group.questionIds
                    .map((id) => questions.find((q) => q.id === id))
                    .filter((q) => q !== undefined),
            }))
            : [{
                    id: 'default',
                    title: { en: 'Questions', zh: '问题' },
                    questionIds: questions.map((q) => q.id),
                    questions,
                }];
        const groupsWithProgress = questionGroups.map((group) => {
            const answeredCount = group.questions.filter((q) => answeredQuestionIds.includes(q.id)).length;
            const totalCount = group.questions.length;
            const progress = totalCount > 0 ? answeredCount / totalCount : 0;
            const isComplete = answeredCount === totalCount && totalCount > 0;
            return {
                id: group.id,
                title: group.title,
                description: group.description,
                questions: group.questions,
                answeredCount,
                totalCount,
                progress,
                isComplete,
            };
        });
        const totalQuestions = questions.length;
        const answeredQuestions = answeredQuestionIds.length;
        const overallProgress = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;
        const currentGroupIndex = groupsWithProgress.findIndex((g) => !g.isComplete);
        const finalCurrentGroupIndex = currentGroupIndex >= 0 ? currentGroupIndex : groupsWithProgress.length - 1;
        return {
            groups: groupsWithProgress,
            totalQuestions,
            answeredQuestions,
            overallProgress,
            currentGroupIndex: finalCurrentGroupIndex,
        };
    }
    getNextQuestion(rule, answeredQuestionIds = []) {
        if (!rule.then.userDecision || !rule.then.userDecision.questions) {
            return null;
        }
        const questions = rule.then.userDecision.questions;
        const groups = rule.then.userDecision.groups || [];
        if (groups.length > 0) {
            for (const group of groups) {
                for (const questionId of group.questionIds) {
                    const question = questions.find((q) => q.id === questionId);
                    if (question && !answeredQuestionIds.includes(questionId)) {
                        return question;
                    }
                }
            }
        }
        else {
            for (const question of questions) {
                if (!answeredQuestionIds.includes(question.id)) {
                    return question;
                }
            }
        }
        return null;
    }
};
exports.UserDecisionService = UserDecisionService;
exports.UserDecisionService = UserDecisionService = UserDecisionService_1 = __decorate([
    (0, common_1.Injectable)()
], UserDecisionService);
//# sourceMappingURL=user-decision.service.js.map