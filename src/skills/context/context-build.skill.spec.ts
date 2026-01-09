// src/skills/context/context-build.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ContextBuildSkill } from './context-build.skill';
import { ContextEngineerService } from '../../agent/context-engine/services/context-engineer.service';
import { ContextPackageOptions } from '../../agent/context-engine/types/context-package.types';

describe('ContextBuildSkill', () => {
  let skill: ContextBuildSkill;
  let contextEngineer: jest.Mocked<ContextEngineerService>;

  beforeEach(async () => {
    const mockContextEngineer = {
      build: jest.fn(),
      projectState: jest.fn(),
      writeBack: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuildSkill,
        {
          provide: ContextEngineerService,
          useValue: mockContextEngineer,
        },
      ],
    }).compile();

    skill = module.get<ContextBuildSkill>(ContextBuildSkill);
    contextEngineer = module.get(ContextEngineerService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('context.build');
  });

  describe('execute', () => {
    it('应该调用 ContextEngineerService.build', async () => {
      const mockPackage = {
        id: 'ctx-123',
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
        blocks: [],
        totalTokens: 1000,
        tokenBudget: 3600,
        compressed: false,
        createdAt: new Date().toISOString(),
      };

      contextEngineer.build.mockResolvedValue(mockPackage as any);

      const input: ContextPackageOptions = {
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
        userQuery: '测试查询',
        tokenBudget: 3600,
      };

      const result = await skill.execute(input);

      expect(contextEngineer.build).toHaveBeenCalled();
      // 检查调用参数（第一个参数应该是 options，第二个是 useCache）
      const buildCall = contextEngineer.build.mock.calls[0];
      expect(buildCall[0]).toMatchObject({
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
      });
      expect(result.contextPackage).toBeDefined();
      expect(result.contextPackage.id).toBe('ctx-123');
    });

    it('应该调用 build 方法（默认 useCache=true）', async () => {
      const mockPackage = {
        id: 'ctx-123',
        blocks: [],
        totalTokens: 1000,
        tokenBudget: 3600,
        compressed: false,
        createdAt: new Date().toISOString(),
      };

      contextEngineer.build.mockResolvedValue(mockPackage as any);

      const input: ContextPackageOptions = {
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
        userQuery: '测试查询',
      };

      await skill.execute(input);

      // context.build skill 调用 build(options)，默认 useCache=true
      expect(contextEngineer.build).toHaveBeenCalled();
      const buildCall = contextEngineer.build.mock.calls[0];
      expect(buildCall[0]).toMatchObject({
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
        userQuery: '测试查询',
      });
      // 注意：context.build skill 调用 build(options) 时没有传递 useCache 参数
      // 所以 build 方法使用默认值 useCache=true
    });
  });
});