// src/trips/readiness/services/__tests__/user-decision.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { UserDecisionService } from '../user-decision.service';
import { Rule, Action, UserDecision, UserQuestion, DecisionBranch } from '../../types/readiness-pack.types';

describe('UserDecisionService', () => {
  let service: UserDecisionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserDecisionService],
    }).compile();

    service = module.get<UserDecisionService>(UserDecisionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processUserDecision', () => {
    describe('基本流程', () => {
      it('应该在没有 userDecision 时返回原始 Action', async () => {
        const rule: Rule = {
          id: 'rule.test.1',
          category: 'safety_critical',
          severity: 'high',
          then: {
            level: 'must',
            message: { en: 'Test message', zh: '测试消息' },
          },
        };

        const result = await service.processUserDecision(rule, {});

        expect(result.updatedAction).toEqual(rule.then);
        expect(result.blockTrip).toBe(false);
        expect(result.nextQuestions).toBeUndefined();
      });

      it('应该在缺少用户回答时返回需要更多信息', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const rule: Rule = {
          id: 'rule.test.2',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
            },
          },
        };

        const result = await service.processUserDecision(rule, {});

        expect(result.nextQuestions).toEqual([question]);
        expect(result.blockTrip).toBe(false);
      });
    });

    describe('分支匹配', () => {
      it('应该匹配 equals 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'equals',
            value: true,
          },
          then: {
            level: 'should',
            message: { en: 'Good!', zh: '很好！' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.3',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: true });

        expect(result.updatedAction.level).toBe('should');
        expect(result.matchedBranch).toEqual(branch);
        expect(result.blockTrip).toBe(false);
      });

      it('应该匹配 not_equals 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'single_choice',
          question: { en: 'Experience level?', zh: '经验水平？' },
          options: [
            { value: 'beginner', label: { en: 'Beginner', zh: '初学者' } },
            { value: 'experienced', label: { en: 'Experienced', zh: '有经验' } },
          ],
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'not_equals',
            value: 'beginner',
          },
          then: {
            level: 'should',
            message: { en: 'You have experience', zh: '您有经验' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.4',
          category: 'safety_critical',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Experience required', zh: '需要经验' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: 'experienced' });

        expect(result.updatedAction.level).toBe('should');
        expect(result.matchedBranch).toEqual(branch);
      });

      it('应该匹配 contains 条件（数组）', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'multiple_choice',
          question: { en: 'What activities?', zh: '什么活动？' },
          options: [
            { value: 'hiking', label: { en: 'Hiking', zh: '徒步' } },
            { value: 'kayaking', label: { en: 'Kayaking', zh: '皮划艇' } },
          ],
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'contains',
            value: 'kayaking',
          },
          then: {
            level: 'blocker',
            message: { en: 'Kayaking requires special gear', zh: '皮划艇需要特殊装备' },
            blockTrip: true,
          },
        };

        const rule: Rule = {
          id: 'rule.test.5',
          category: 'safety_critical',
          severity: 'extreme',
          then: {
            level: 'must',
            message: { en: 'Check activities', zh: '检查活动' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: ['hiking', 'kayaking'] });

        expect(result.updatedAction.level).toBe('blocker');
        expect(result.blockTrip).toBe(true);
      });

      it('应该匹配 greater_than 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'number',
          question: { en: 'Insurance coverage amount?', zh: '保险覆盖金额？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'greater_than',
            value: 100000,
          },
          then: {
            level: 'should',
            message: { en: 'Sufficient coverage', zh: '覆盖充足' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.6',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: 150000 });

        expect(result.updatedAction.level).toBe('should');
      });

      it('应该匹配 less_than 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'number',
          question: { en: 'Insurance coverage amount?', zh: '保险覆盖金额？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'less_than',
            value: 100000,
          },
          then: {
            level: 'blocker',
            message: { en: 'Insufficient coverage', zh: '覆盖不足' },
            blockTrip: true,
          },
        };

        const rule: Rule = {
          id: 'rule.test.7',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'must',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: 50000 });

        expect(result.updatedAction.level).toBe('blocker');
        expect(result.blockTrip).toBe(true);
      });

      it('应该匹配 in 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'single_choice',
          question: { en: 'Experience level?', zh: '经验水平？' },
          options: [
            { value: 'beginner', label: { en: 'Beginner', zh: '初学者' } },
            { value: 'intermediate', label: { en: 'Intermediate', zh: '中级' } },
            { value: 'experienced', label: { en: 'Experienced', zh: '有经验' } },
          ],
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'in',
            value: ['experienced', 'intermediate'],
          },
          then: {
            level: 'should',
            message: { en: 'You have sufficient experience', zh: '您有足够的经验' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.8',
          category: 'safety_critical',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Experience required', zh: '需要经验' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: 'experienced' });

        expect(result.updatedAction.level).toBe('should');
      });

      it('应该匹配 not_in 条件', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'single_choice',
          question: { en: 'Experience level?', zh: '经验水平？' },
          options: [
            { value: 'beginner', label: { en: 'Beginner', zh: '初学者' } },
            { value: 'experienced', label: { en: 'Experienced', zh: '有经验' } },
          ],
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'not_in',
            value: ['experienced', 'intermediate'],
          },
          then: {
            level: 'blocker',
            message: { en: 'Insufficient experience', zh: '经验不足' },
            blockTrip: true,
          },
        };

        const rule: Rule = {
          id: 'rule.test.9',
          category: 'safety_critical',
          severity: 'high',
          then: {
            level: 'must',
            message: { en: 'Experience required', zh: '需要经验' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: 'beginner' });

        expect(result.updatedAction.level).toBe('blocker');
        expect(result.blockTrip).toBe(true);
      });
    });

    describe('默认分支', () => {
      it('应该在没有任何分支匹配时使用默认分支', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'equals',
            value: true,
          },
          then: {
            level: 'should',
            message: { en: 'Good!', zh: '很好！' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.10',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
              defaultBranch: {
                level: 'blocker',
                message: { en: 'No insurance', zh: '没有保险' },
                blockTrip: true,
              },
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: false });

        expect(result.updatedAction.level).toBe('blocker');
        expect(result.blockTrip).toBe(true);
        expect(result.matchedBranch).toBeUndefined();
      });
    });

    describe('多轮问答', () => {
      it('应该在分支匹配后返回后续问题', async () => {
        const question1: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const question2: UserQuestion = {
          id: 'q2',
          type: 'number',
          question: { en: 'Coverage amount?', zh: '覆盖金额？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'equals',
            value: true,
          },
          then: {
            level: 'should',
            message: { en: 'Good!', zh: '很好！' },
            additionalQuestions: [question2],
          },
        };

        const rule: Rule = {
          id: 'rule.test.11',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question1],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: true });

        expect(result.nextQuestions).toEqual([question2]);
        expect(result.updatedAction.userDecision?.questions).toContainEqual(question2);
      });
    });

    describe('blockTrip 触发', () => {
      it('应该在 blockTrip = true 时强制设置为 blocker', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'equals',
            value: false,
          },
          then: {
            level: 'must',
            message: { en: 'No insurance', zh: '没有保险' },
            blockTrip: true,
          },
        };

        const rule: Rule = {
          id: 'rule.test.12',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'must',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: false });

        expect(result.updatedAction.level).toBe('blocker');
        expect(result.blockTrip).toBe(true);
      });
    });

    describe('边界情况', () => {
      it('应该处理空回答', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const rule: Rule = {
          id: 'rule.test.13',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              defaultBranch: {
                level: 'blocker',
                message: { en: 'No answer', zh: '没有回答' },
              },
            },
          },
        };

        const result = await service.processUserDecision(rule, {});

        expect(result.nextQuestions).toEqual([question]);
      });

      it('应该处理无效的操作符', async () => {
        const question: UserQuestion = {
          id: 'q1',
          type: 'yes_no',
          question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
        };

        const branch: DecisionBranch = {
          condition: {
            questionId: 'q1',
            operator: 'invalid_operator' as any,
            value: true,
          },
          then: {
            level: 'should',
            message: { en: 'Good!', zh: '很好！' },
          },
        };

        const rule: Rule = {
          id: 'rule.test.14',
          category: 'health_insurance',
          severity: 'high',
          then: {
            level: 'blocker',
            message: { en: 'Insurance required', zh: '需要保险' },
            userDecision: {
              questions: [question],
              branches: [branch],
              defaultBranch: {
                level: 'blocker',
                message: { en: 'Default', zh: '默认' },
              },
            },
          },
        };

        const result = await service.processUserDecision(rule, { q1: true });

        // 应该使用默认分支，因为无效操作符不会匹配
        expect(result.updatedAction.level).toBe('blocker');
      });
    });
  });

  describe('getQuestionsForRule', () => {
    it('应该返回规则中的问题', () => {
      const question: UserQuestion = {
        id: 'q1',
        type: 'yes_no',
        question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
      };

      const rule: Rule = {
        id: 'rule.test.15',
        category: 'health_insurance',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Insurance required', zh: '需要保险' },
          userDecision: {
            questions: [question],
          },
        },
      };

      const questions = service.getQuestionsForRule(rule);

      expect(questions).toEqual([question]);
    });

    it('应该在规则没有 userDecision 时返回空数组', () => {
      const rule: Rule = {
        id: 'rule.test.16',
        category: 'safety_critical',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
        },
      };

      const questions = service.getQuestionsForRule(rule);

      expect(questions).toEqual([]);
    });
  });

  describe('requiresUserDecision', () => {
    it('应该在规则有 userDecision 且有问题时返回 true', () => {
      const question: UserQuestion = {
        id: 'q1',
        type: 'yes_no',
        question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
      };

      const rule: Rule = {
        id: 'rule.test.17',
        category: 'health_insurance',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Insurance required', zh: '需要保险' },
          userDecision: {
            questions: [question],
          },
        },
      };

      expect(service.requiresUserDecision(rule)).toBe(true);
    });

    it('应该在规则没有 userDecision 时返回 false', () => {
      const rule: Rule = {
        id: 'rule.test.18',
        category: 'safety_critical',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Test', zh: '测试' },
        },
      };

      expect(service.requiresUserDecision(rule)).toBe(false);
    });

    it('应该在 userDecision 没有问题列表时返回 false', () => {
      const rule: Rule = {
        id: 'rule.test.19',
        category: 'health_insurance',
        severity: 'high',
        then: {
          level: 'blocker',
          message: { en: 'Insurance required', zh: '需要保险' },
          userDecision: {
            questions: [],
          },
        },
      };

      expect(service.requiresUserDecision(rule)).toBe(false);
    });
  });
});
