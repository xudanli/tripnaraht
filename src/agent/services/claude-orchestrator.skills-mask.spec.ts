import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';

describe('ClaudeOrchestratorService — skills "memory wipe" under emergency_constraints', () => {
  it('filters drive-related skills from Skills selection prompt when forbidden_modes includes DRIVE', async () => {
    const callLlmWithSchema = jest.fn().mockResolvedValue(
      JSON.stringify({
        selectedSkills: [],
        executionOrder: [],
        dependencies: {},
      }),
    );

    const skillsRegistry = {
      getAllSkillsForEmergencyConstraints: jest.fn((ec?: any) => {
        const forbidden = (ec?.forbidden_modes ?? []).map((x: any) => String(x).toUpperCase());
        if (forbidden.includes('DRIVE')) {
          return [
            { metadata: { name: 'world.buildContext', description: 'Build world model context' } },
            { metadata: { name: 'itinerary.verify', description: 'Verify itinerary feasibility' } },
          ];
        }
        return [
          { metadata: { name: 'transport.drive_navigation', description: 'Driving navigation helper' } },
          { metadata: { name: 'world.buildContext', description: 'Build world model context' } },
        ];
      }),
      getAllSkills: jest.fn().mockReturnValue([]),
      getSkill: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeOrchestratorService,
        {
          provide: LlmService,
          useValue: {
            getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.ANTHROPIC),
            callLlmWithSchema,
          },
        },
        { provide: PrismaService, useValue: {} },
        {
          provide: RagRealityPolicyGateService,
          useValue: {
            resolve: jest.fn().mockReturnValue({ scope: 'full', policy: {} }),
            mergeChunkRetrievalParams: jest.fn((p: unknown) => p),
          },
        },
        { provide: SKILLS_REGISTRY_TOKEN, useValue: skillsRegistry },
      ],
    }).compile();

    const orchestrator = module.get<ClaudeOrchestratorService>(ClaudeOrchestratorService);

    // invoke the private selection method to capture the prompt content
    await (orchestrator as any).selectSkills(
      { intentType: 'PLAN_TRIP', complexity: 'MEDIUM', entities: [], constraints: [] },
      { route: 'SYSTEM2_REASONING', confidence: 0.9, reasoning: 'test', budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 } },
      { requestId: 'req-1', userId: 'u1' },
      LlmProvider.ANTHROPIC,
      'req-1',
      { forbidden_modes: ['DRIVE'] },
    );

    const prompt = String(callLlmWithSchema.mock.calls?.[0]?.[1] ?? '');
    expect(prompt).toContain('[可用 Skills]');
    expect(prompt).not.toContain('transport.drive_navigation');
    expect(prompt).toContain('world.buildContext');
  });
});

