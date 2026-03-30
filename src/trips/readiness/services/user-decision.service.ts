// src/trips/readiness/services/user-decision.service.ts

/**
 * User Decision Service
 * 
 * 处理用户决策流程，根据用户回答评估决策分支并返回更新后的 Action
 */

import { Injectable, Logger } from '@nestjs/common';
import { Rule, Action, DecisionBranch, UserQuestion, QuestionGroup, LocalizedString } from '../types/readiness-pack.types';

export interface ProcessUserDecisionResult {
  updatedAction: Action;
  blockTrip: boolean;
  nextQuestions?: UserQuestion[];
  matchedBranch?: DecisionBranch;
}

@Injectable()
export class UserDecisionService {
  private readonly logger = new Logger(UserDecisionService.name);

  /**
   * 处理用户决策流程
   * @param rule 触发的规则
   * @param userAnswers 用户回答（questionId -> answer）
   * @returns 更新后的 Action 和处理结果
   */
  async processUserDecision(
    rule: Rule,
    userAnswers: Record<string, any>
  ): Promise<ProcessUserDecisionResult> {
    // 1. 检查是否有 userDecision
    if (!rule.then.userDecision) {
      this.logger.debug(`规则 ${rule.id} 没有 userDecision，返回原始 Action`);
      return {
        updatedAction: rule.then,
        blockTrip: rule.then.level === 'blocker',
        nextQuestions: undefined,
      };
    }

    const { questions, branches, defaultBranch } = rule.then.userDecision;

    // 2. 验证用户回答是否完整
    const missingAnswers = this.validateAnswers(questions, userAnswers);
    if (missingAnswers.length > 0) {
      this.logger.warn(`规则 ${rule.id} 缺少用户回答: ${missingAnswers.join(', ')}`);
      // 返回原始 Action，但标记需要更多信息
      return {
        updatedAction: rule.then,
        blockTrip: false,
        nextQuestions: questions.filter(q => missingAnswers.includes(q.id)),
      };
    }

    // 3. 评估所有分支
    for (const branch of branches || []) {
      if (this.evaluateBranchCondition(branch, userAnswers)) {
        // 找到匹配的分支
        this.logger.debug(`规则 ${rule.id} 匹配分支: ${JSON.stringify(branch.condition)}`);
        
        const branchAction = branch.then;
        const blockTrip = branchAction.blockTrip || false;
        
        // 4. 合并 Action（优先级：branch > 原始）
        const mergedAction: Action = {
          level: branchAction.level || rule.then.level,
          message: branchAction.message || rule.then.message,
          tasks: branchAction.tasks || rule.then.tasks,
          userDecision: rule.then.userDecision, // 保留原始 userDecision
        };

        // 5. 如果 blockTrip = true，强制设置为 blocker
        if (blockTrip) {
          mergedAction.level = 'blocker';
        }

        // 6. 检查是否有后续问题
        const nextQuestions = branchAction.additionalQuestions || undefined;
        
        // 7. 如果有后续问题，更新 userDecision 中的问题列表
        if (nextQuestions && nextQuestions.length > 0) {
          mergedAction.userDecision = {
            ...rule.then.userDecision!,
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

    // 7. 没有匹配的分支，使用默认分支
    if (defaultBranch) {
      this.logger.debug(`规则 ${rule.id} 使用默认分支`);
      const blockTrip = defaultBranch.blockTrip || false;
      const updatedAction: Action = {
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

    // 8. 没有默认分支，返回原始 Action
    this.logger.debug(`规则 ${rule.id} 没有匹配的分支和默认分支，返回原始 Action`);
    return {
      updatedAction: rule.then,
      blockTrip: rule.then.level === 'blocker',
      nextQuestions: undefined,
    };
  }

  /**
   * 验证用户回答是否完整
   */
  private validateAnswers(
    questions: UserQuestion[],
    userAnswers: Record<string, any>
  ): string[] {
    const missing: string[] = [];
    
    for (const question of questions) {
      if (!(question.id in userAnswers)) {
        missing.push(question.id);
      } else {
        // 验证答案类型
        const answer = userAnswers[question.id];
        if (!this.validateAnswerType(question, answer)) {
          this.logger.warn(`问题 ${question.id} 的答案类型不匹配`);
          // 不强制要求类型匹配，但记录警告
        }
      }
    }

    return missing;
  }

  /**
   * 验证答案类型
   */
  private validateAnswerType(question: UserQuestion, answer: any): boolean {
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
        const min = question.validation?.min || 1;
        const max = question.validation?.max || 5;
        return typeof answer === 'number' && answer >= min && answer <= max;
      default:
        return true; // 未知类型，不验证
    }
  }

  /**
   * 评估分支条件
   */
  private evaluateBranchCondition(
    branch: DecisionBranch,
    userAnswers: Record<string, any>
  ): boolean {
    const { questionId, operator, value } = branch.condition;
    const userAnswer = userAnswers[questionId];

    if (userAnswer === undefined) {
      return false; // 用户没有回答这个问题
    }

    return this.evaluateCondition(userAnswer, operator, value);
  }

  /**
   * 评估条件
   */
  private evaluateCondition(
    userAnswer: any,
    operator: string,
    expectedValue: any
  ): boolean {
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
    } catch (error) {
      this.logger.error(`评估条件时出错: ${error}`, error instanceof Error ? error.stack : undefined);
      return false;
    }
  }

  /**
   * 获取规则中需要问用户的问题
   */
  getQuestionsForRule(rule: Rule): UserQuestion[] {
    if (!rule.then.userDecision) {
      return [];
    }

    return rule.then.userDecision.questions || [];
  }

  /**
   * 检查规则是否需要用户决策
   */
  requiresUserDecision(rule: Rule): boolean {
    return !!(
      rule.then.userDecision &&
      rule.then.userDecision.questions &&
      rule.then.userDecision.questions.length > 0
    );
  }

  /**
   * 获取问题分组信息（用于简化用户决策流程）
   * 
   * @param rule 规则
   * @param answeredQuestionIds 已回答的问题 ID 列表（可选）
   * @returns 问题分组信息，包含进度提示
   */
  getQuestionGroups(
    rule: Rule,
    answeredQuestionIds: string[] = []
  ): {
    groups: Array<{
      id: string;
      title: LocalizedString;
      description?: LocalizedString;
      questions: UserQuestion[];
      answeredCount: number;
      totalCount: number;
      progress: number; // 0-1
      isComplete: boolean;
    }>;
    totalQuestions: number;
    answeredQuestions: number;
    overallProgress: number; // 0-1
    currentGroupIndex: number; // 当前应该显示的分组索引（第一个未完成的分组）
  } {
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
    const groups: QuestionGroup[] = (rule.then.userDecision as any).groups || [];

    // 如果没有分组，创建一个默认分组包含所有问题
    const questionGroups: Array<QuestionGroup & { questions: UserQuestion[] }> = groups.length > 0
      ? groups.map((group: QuestionGroup) => ({
          ...group,
          questions: group.questionIds
            .map((id: string) => questions.find((q: UserQuestion) => q.id === id))
            .filter((q): q is UserQuestion => q !== undefined),
        }))
      : [{
          id: 'default',
          title: { en: 'Questions', zh: '问题' },
          questionIds: questions.map((q: UserQuestion) => q.id),
          questions,
        }];

    // 计算每个分组的进度
    const groupsWithProgress = questionGroups.map((group: QuestionGroup & { questions: UserQuestion[] }) => {
      const answeredCount = group.questions.filter((q: UserQuestion) => answeredQuestionIds.includes(q.id)).length;
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

    // 计算总体进度
    const totalQuestions = questions.length;
    const answeredQuestions = answeredQuestionIds.length;
    const overallProgress = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;

    // 找到当前应该显示的分组（第一个未完成的分组）
    const currentGroupIndex = groupsWithProgress.findIndex((g: any) => !g.isComplete);
    const finalCurrentGroupIndex = currentGroupIndex >= 0 ? currentGroupIndex : groupsWithProgress.length - 1;

    return {
      groups: groupsWithProgress,
      totalQuestions,
      answeredQuestions,
      overallProgress,
      currentGroupIndex: finalCurrentGroupIndex,
    };
  }

  /**
   * 获取下一个需要回答的问题（用于进度提示）
   * 
   * @param rule 规则
   * @param answeredQuestionIds 已回答的问题 ID 列表
   * @returns 下一个需要回答的问题，如果没有则返回 null
   */
  getNextQuestion(
    rule: Rule,
    answeredQuestionIds: string[] = []
  ): UserQuestion | null {
    if (!rule.then.userDecision || !rule.then.userDecision.questions) {
      return null;
    }

    const questions = rule.then.userDecision.questions;
    const groups: QuestionGroup[] = (rule.then.userDecision as any).groups || [];

    // 如果有分组，按分组顺序查找
    if (groups.length > 0) {
      for (const group of groups) {
        for (const questionId of group.questionIds) {
          const question = questions.find((q: UserQuestion) => q.id === questionId);
          if (question && !answeredQuestionIds.includes(questionId)) {
            return question;
          }
        }
      }
    } else {
      // 没有分组，直接查找第一个未回答的问题
      for (const question of questions) {
        if (!answeredQuestionIds.includes(question.id)) {
          return question;
        }
      }
    }

    return null; // 所有问题都已回答
  }
}
