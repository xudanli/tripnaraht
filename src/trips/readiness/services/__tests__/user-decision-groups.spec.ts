// src/trips/readiness/services/__tests__/user-decision-groups.spec.ts

import { UserDecisionService } from '../user-decision.service';
import { Rule } from '../../types/readiness-pack.types';

describe('UserDecisionService - Question Groups', () => {
  let service: UserDecisionService;

  beforeEach(() => {
    service = new UserDecisionService();
  });

  describe('getQuestionGroups', () => {
    it('应该返回默认分组（如果没有定义分组）', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
            ],
          },
        },
      };

      const result = service.getQuestionGroups(rule, []);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].id).toBe('default');
      expect(result.groups[0].questions).toHaveLength(2);
      expect(result.totalQuestions).toBe(2);
      expect(result.answeredQuestions).toBe(0);
      expect(result.overallProgress).toBe(0);
    });

    it('应该返回自定义分组', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
              { id: 'q3', type: 'yes_no', question: { en: 'Question 3', zh: '问题3' } },
            ],
            groups: [
              {
                id: 'group1',
                title: { en: 'Basic Info', zh: '基本信息' },
                questionIds: ['q1', 'q2'],
              },
              {
                id: 'group2',
                title: { en: 'Additional Info', zh: '附加信息' },
                questionIds: ['q3'],
              },
            ],
          },
        },
      };

      const result = service.getQuestionGroups(rule, []);

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].id).toBe('group1');
      expect(result.groups[0].questions).toHaveLength(2);
      expect(result.groups[1].id).toBe('group2');
      expect(result.groups[1].questions).toHaveLength(1);
      expect(result.totalQuestions).toBe(3);
    });

    it('应该计算分组进度', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
            ],
            groups: [
              {
                id: 'group1',
                title: { en: 'Basic Info', zh: '基本信息' },
                questionIds: ['q1', 'q2'],
              },
            ],
          },
        },
      };

      const result = service.getQuestionGroups(rule, ['q1']);

      expect(result.groups[0].answeredCount).toBe(1);
      expect(result.groups[0].totalCount).toBe(2);
      expect(result.groups[0].progress).toBe(0.5);
      expect(result.groups[0].isComplete).toBe(false);
      expect(result.overallProgress).toBe(0.5);
    });

    it('应该标记已完成的分组', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
            ],
            groups: [
              {
                id: 'group1',
                title: { en: 'Basic Info', zh: '基本信息' },
                questionIds: ['q1', 'q2'],
              },
            ],
          },
        },
      };

      const result = service.getQuestionGroups(rule, ['q1', 'q2']);

      expect(result.groups[0].isComplete).toBe(true);
      expect(result.overallProgress).toBe(1);
    });

    it('应该找到当前应该显示的分组', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
              { id: 'q3', type: 'yes_no', question: { en: 'Question 3', zh: '问题3' } },
            ],
            groups: [
              {
                id: 'group1',
                title: { en: 'Basic Info', zh: '基本信息' },
                questionIds: ['q1', 'q2'],
              },
              {
                id: 'group2',
                title: { en: 'Additional Info', zh: '附加信息' },
                questionIds: ['q3'],
              },
            ],
          },
        },
      };

      // 第一个分组已完成，应该显示第二个分组
      const result = service.getQuestionGroups(rule, ['q1', 'q2']);

      expect(result.currentGroupIndex).toBe(1);
    });
  });

  describe('getNextQuestion', () => {
    it('应该返回下一个未回答的问题', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
            ],
          },
        },
      };

      const nextQuestion = service.getNextQuestion(rule, ['q1']);

      expect(nextQuestion).not.toBeNull();
      expect(nextQuestion?.id).toBe('q2');
    });

    it('应该按分组顺序返回下一个问题', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
              { id: 'q2', type: 'yes_no', question: { en: 'Question 2', zh: '问题2' } },
              { id: 'q3', type: 'yes_no', question: { en: 'Question 3', zh: '问题3' } },
            ],
            groups: [
              {
                id: 'group1',
                title: { en: 'Basic Info', zh: '基本信息' },
                questionIds: ['q1', 'q2'],
              },
              {
                id: 'group2',
                title: { en: 'Additional Info', zh: '附加信息' },
                questionIds: ['q3'],
              },
            ],
          },
        },
      };

      // 第一个分组已完成，应该返回第二个分组的问题
      const nextQuestion = service.getNextQuestion(rule, ['q1', 'q2']);

      expect(nextQuestion).not.toBeNull();
      expect(nextQuestion?.id).toBe('q3');
    });

    it('如果所有问题都已回答，应该返回 null', () => {
      const rule: Rule = {
        id: 'rule.test',
        category: 'safety_hazards',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
          userDecision: {
            questions: [
              { id: 'q1', type: 'yes_no', question: { en: 'Question 1', zh: '问题1' } },
            ],
          },
        },
      };

      const nextQuestion = service.getNextQuestion(rule, ['q1']);

      expect(nextQuestion).toBeNull();
    });
  });
});
