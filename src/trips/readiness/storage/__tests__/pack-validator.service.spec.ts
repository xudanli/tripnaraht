// src/trips/readiness/storage/__tests__/pack-validator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { PackValidatorService } from '../pack-validator.service';
import { PackStorageService } from '../pack-storage.service';
import { ReadinessPack, UserDecision, UserQuestion, DecisionBranch } from '../../types/readiness-pack.types';

describe('PackValidatorService - UserDecision Validation', () => {
  let service: PackValidatorService;
  let mockPackStorage: jest.Mocked<PackStorageService>;

  beforeEach(async () => {
    mockPackStorage = {
      loadPack: jest.fn(),
      savePack: jest.fn(),
      findPackByDestination: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackValidatorService,
        {
          provide: PackStorageService,
          useValue: mockPackStorage,
        },
      ],
    }).compile();

    service = module.get<PackValidatorService>(PackValidatorService);
  });

  describe('validateUserDecision', () => {
    it('应该验证 userDecision 的基本结构', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.1',
        destinationId: 'TEST-1',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.1',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [], // 空问题列表应该报错
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('userDecision.questions'))).toBe(true);
    });

    it('应该验证问题的必需字段', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.2',
        destinationId: 'TEST-2',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.2',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: '', // 空 ID 应该报错
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  } as any,
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('questions[0].id') && e.code === 'MISSING_FIELD')).toBe(true);
    });

    it('应该验证问题类型', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.3',
        destinationId: 'TEST-3',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.3',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'invalid_type' as any, // 无效类型应该报错
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('questions[0].type') && e.code === 'INVALID_TYPE')).toBe(true);
    });

    it('应该验证选择题的选项', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.4',
        destinationId: 'TEST-4',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.4',
            category: 'safety_critical',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['glacier-trekking'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Experience required', zh: '需要经验' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'single_choice',
                    question: { en: 'Experience level?', zh: '经验水平？' },
                    // 缺少 options 应该报错
                  } as any,
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('questions[0].options') && e.code === 'MISSING_FIELD')).toBe(true);
    });

    it('应该警告选项过多', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.5',
        destinationId: 'TEST-5',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.5',
            category: 'safety_critical',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['glacier-trekking'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Experience required', zh: '需要经验' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'single_choice',
                    question: { en: 'Experience level?', zh: '经验水平？' },
                    options: Array.from({ length: 15 }, (_, i) => ({
                      value: `option${i}`,
                      label: { en: `Option ${i}`, zh: `选项 ${i}` },
                    })),
                  },
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.warnings.some(w => w.path.includes('questions[0].options') && w.code === 'TOO_MANY_OPTIONS')).toBe(true);
    });

    it('应该验证决策分支的条件', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.6',
        destinationId: 'TEST-6',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.6',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
                branches: [
                  {
                    condition: {
                      questionId: '', // 空 questionId 应该报错
                      operator: 'equals',
                      value: true,
                    },
                    then: {
                      level: 'should',
                      message: { en: 'Good!', zh: '很好！' },
                    },
                  } as any,
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('branches[0].condition.questionId') && e.code === 'MISSING_FIELD')).toBe(true);
    });

    it('应该验证决策分支的 questionId 是否存在于问题列表中', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.7',
        destinationId: 'TEST-7',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.7',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
                branches: [
                  {
                    condition: {
                      questionId: 'q2', // q2 不存在于问题列表中
                      operator: 'equals',
                      value: true,
                    },
                    then: {
                      level: 'should',
                      message: { en: 'Good!', zh: '很好！' },
                    },
                  },
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('condition.questionId') && e.code === 'INVALID_QUESTION_ID')).toBe(true);
    });

    it('应该验证决策分支的操作符', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.8',
        destinationId: 'TEST-8',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.8',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
                branches: [
                  {
                    condition: {
                      questionId: 'q1',
                      operator: 'invalid_operator' as any, // 无效操作符应该报错
                      value: true,
                    },
                    then: {
                      level: 'should',
                      message: { en: 'Good!', zh: '很好！' },
                    },
                  },
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('condition.operator') && e.code === 'INVALID_OPERATOR')).toBe(true);
    });

    it('应该警告缺少默认分支', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.9',
        destinationId: 'TEST-9',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.9',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
                branches: [
                  {
                    condition: {
                      questionId: 'q1',
                      operator: 'equals',
                      value: true,
                    },
                    then: {
                      level: 'should',
                      message: { en: 'Good!', zh: '很好！' },
                    },
                  },
                ],
                // 缺少 defaultBranch 应该警告
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      // 注意：如果规则本身有其他验证错误，valid 可能为 false
      // 我们只检查警告是否存在
      expect(result.warnings.some(w => w.path.includes('defaultBranch') && w.code === 'MISSING_DEFAULT_BRANCH')).toBe(true);
    });

    it('应该警告不必要的默认分支', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.10',
        destinationId: 'TEST-10',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.10',
            category: 'health_insurance',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['antarctica-expedition'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Insurance required', zh: '需要保险' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'yes_no',
                    question: { en: 'Do you have insurance?', zh: '您有保险吗？' },
                  },
                ],
                // 没有 branches，但有 defaultBranch 应该警告
                defaultBranch: {
                  level: 'blocker',
                  message: { en: 'No insurance', zh: '没有保险' },
                },
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      // 注意：如果规则本身有其他验证错误，valid 可能为 false
      // 我们只检查警告是否存在
      expect(result.warnings.some(w => w.path.includes('defaultBranch') && w.code === 'UNNECESSARY_DEFAULT_BRANCH')).toBe(true);
    });

    it('应该验证 rating 问题的 min 和 max', () => {
      const pack: ReadinessPack = {
        packId: 'pack.test.11',
        destinationId: 'TEST-11',
        version: '1.0.0',
        lastReviewedAt: '2026-01-30T00:00:00Z',
        displayName: { en: 'Test Pack', zh: '测试包' },
        supportedSeasons: ['summer'],
        rules: [
          {
            id: 'rule.test.11',
            category: 'safety_critical',
            severity: 'high',
            when: {
              any: [
                {
                  containsAny: {
                    path: 'itinerary.activities',
                    values: ['glacier-trekking'],
                  },
                },
              ],
            },
            then: {
              level: 'blocker',
              message: { en: 'Experience required', zh: '需要经验' },
              userDecision: {
                questions: [
                  {
                    id: 'q1',
                    type: 'rating',
                    question: { en: 'Rate your experience', zh: '评价您的经验' },
                    validation: {
                      min: 5, // min >= max 应该报错
                      max: 3,
                    },
                  },
                ],
              },
            },
          },
        ],
        checklists: [],
        hazards: [],
        geo: {
          countryCode: 'TEST',
          lat: 0,
          lng: 0,
        },
      };

      const result = service.validate(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('questions[0].validation.min') && e.code === 'INVALID_RANGE')).toBe(true);
    });
  });
});
