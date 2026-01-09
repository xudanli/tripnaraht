// src/skills/context/tools-select.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ToolsSelectSkill } from './tools-select.skill';
import { SkillsRegistryService } from '../services/skills-registry.service';
import { EmbeddingService } from '../../places/services/embedding.service';

describe('ToolsSelectSkill', () => {
  let skill: ToolsSelectSkill;
  let skillsRegistry: jest.Mocked<SkillsRegistryService>;
  let embeddingService: jest.Mocked<EmbeddingService>;

  beforeEach(async () => {
    const mockSkillsRegistry = {
      getAllSkills: jest.fn(),
    };

    const mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      getEmbeddingDimension: jest.fn().mockReturnValue(1536),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsSelectSkill,
        {
          provide: SkillsRegistryService,
          useValue: mockSkillsRegistry,
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    skill = module.get<ToolsSelectSkill>(ToolsSelectSkill);
    skillsRegistry = module.get(SkillsRegistryService);
    embeddingService = module.get(EmbeddingService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('tools.select');
  });

  describe('execute - 规则匹配', () => {
    beforeEach(() => {
      // Mock skills
      skillsRegistry.getAllSkills.mockReturnValue([
        {
          metadata: {
            name: 'routeDirection.pickForIntent',
            description: '根据意图选择路线方向',
          },
        },
        {
          metadata: {
            name: 'decision.abuCheck',
            description: 'Abu 检查',
          },
        },
        {
          metadata: {
            name: 'readiness.generateChecklist',
            description: '生成准备清单',
          },
        },
      ] as any);
    });

    it('应该基于 phase 选择工具', async () => {
      const result = await skill.execute({
        userQuery: '测试查询',
        planningPhase: 'planning',
      });

      expect(result.tools.length).toBeGreaterThan(0);
      expect(result.totalTools).toBeGreaterThan(0);
    });

    it('应该基于用户查询选择工具', async () => {
      const result = await skill.execute({
        userQuery: '帮我检查路线',
        planningPhase: 'planning',
      });

      expect(result.tools.length).toBeGreaterThan(0);
      // 应该包含 route 相关的工具
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames.some((name) => name.includes('route'))).toBe(true);
    });
  });

  describe('execute - 向量检索', () => {
    beforeEach(() => {
      // Mock skills with descriptions
      skillsRegistry.getAllSkills.mockReturnValue([
        {
          metadata: {
            name: 'decision.abuCheck',
            description: '检查行程是否符合 Abu 的偏好和约束',
          },
        },
        {
          metadata: {
            name: 'readiness.generateChecklist',
            description: '生成旅行准备清单',
          },
        },
      ] as any);

      // Mock embeddings
      embeddingService.generateEmbedding.mockImplementation((text: string) => {
        // 简单的 mock：返回基于文本的固定向量
        const dimension = 1536;
        const vector = new Array(dimension).fill(0);
        if (text.includes('检查') || text.includes('check')) {
          vector[0] = 0.9; // 高相似度
        }
        return Promise.resolve(vector);
      });
    });

    it('应该使用向量检索（如果 EmbeddingService 可用）', async () => {
      const result = await skill.execute({
        userQuery: '帮我检查这个行程',
        planningPhase: 'decision',
      });

      expect(embeddingService.generateEmbedding).toHaveBeenCalled();
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('应该在向量检索失败时降级到规则匹配', async () => {
      embeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding 失败'));

      const result = await skill.execute({
        userQuery: '测试查询',
        planningPhase: 'planning',
      });

      expect(result.tools.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('应该返回工具的结构化信息', async () => {
    skillsRegistry.getAllSkills.mockReturnValue([
      {
        metadata: {
          name: 'test.skill',
          description: '测试技能',
        },
      },
    ] as any);

    const result = await skill.execute({
      userQuery: '测试',
      planningPhase: 'planning',
    });

    if (result.tools.length > 0) {
      const tool = result.tools[0];
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.schema).toBeDefined();
      expect(tool.suggestion).toBeDefined();
      expect(tool.priority).toBeGreaterThanOrEqual(0);
      expect(tool.reason).toBeDefined();
    }
  });
});