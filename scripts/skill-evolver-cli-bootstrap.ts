/**
 * SkillEvolver CLI 共享启动：加载 .env + 可选 LlmService（DeepSeek 等）
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { LlmService } from '../src/llm/services/llm.service';
import { SkillRegistryService } from '../src/agent/training/skill-evolver/services/skill-registry.service';
import { TrajectoryStoreService } from '../src/agent/training/skill-evolver/services/trajectory-store.service';
import { SkillEvolverLlmHelper } from '../src/agent/training/skill-evolver/services/skill-evolver-llm.helper';
import { StrategyExplorerService } from '../src/agent/training/skill-evolver/services/strategy-explorer.service';
import { SkillExecutorService } from '../src/agent/training/skill-evolver/services/skill-executor.service';
import { FixtureCaseEvaluatorService } from '../src/agent/training/skill-evolver/services/fixture-case-evaluator.service';
import { DecisionReplayTrajectoryService } from '../src/agent/training/skill-evolver/services/decision-replay-trajectory.service';
import { SkillEvolverEvaluatorService } from '../src/agent/training/skill-evolver/services/skill-evolver-evaluator.service';
import { ContrastiveAnalyzerService } from '../src/agent/training/skill-evolver/services/contrastive-analyzer.service';
import { SkillEditorService } from '../src/agent/training/skill-evolver/services/skill-editor.service';
import { IndependentAuditorService } from '../src/agent/training/skill-evolver/services/independent-auditor.service';
import { SkillEvolverRegressionGateService } from '../src/agent/training/skill-evolver/services/skill-evolver-regression-gate.service';
import { SkillEvolverBatchComparatorService } from '../src/agent/training/skill-evolver/services/skill-evolver-batch-comparator.service';
import { AgentSkillsInteropService } from '../src/agent/training/skill-evolver/services/agent-skills-interop.service';
import { MetaSkillEngineService } from '../src/agent/training/skill-evolver/services/meta-skill-engine.service';
import { configureSkillEvolverLogging } from '../src/agent/training/skill-evolver/utils/skill-evolver-log.util';
import { closeLiveE2eReplayContext } from '../src/agent/training/skill-evolver/utils/live-e2e-replay.harness';

let envLoaded = false;

export function loadProjectEnv(): void {
  if (envLoaded) return;
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  envLoaded = true;
}

export function createLlmServiceForCli(): LlmService | undefined {
  loadProjectEnv();
  if (process.env.LLM_USE_MOCK === 'true') {
    process.stderr.write('[cli] LLM_USE_MOCK=true，使用 fallback\n');
    return undefined;
  }
  const hasKey =
    !!process.env.DEEPSEEK_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.GEMINI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.VLLM_URL;
  if (!hasKey) {
    process.stderr.write('[cli] 未找到 LLM API Key，使用 fallback\n');
    return undefined;
  }
  const llm = new LlmService(undefined);
  process.stdout.write(`[cli] LLM ready: provider=${llm.getDefaultProvider()}\n`);
  return llm;
}

export function createSkillEvolverEngine(opts?: { verbose?: boolean }): {
  engine: MetaSkillEngineService;
  agentSkills: AgentSkillsInteropService;
  registry: SkillRegistryService;
  llmConnected: boolean;
} {
  loadProjectEnv();
  configureSkillEvolverLogging(opts?.verbose);
  const registry = new SkillRegistryService(undefined);
  const store = new TrajectoryStoreService(registry);
  const llmService = createLlmServiceForCli();
  const llm = new SkillEvolverLlmHelper(llmService);
  const executor = new SkillExecutorService(llm);
  const agentSkills = new AgentSkillsInteropService(registry, undefined);
  const engine = new MetaSkillEngineService(
    registry,
    store,
    new StrategyExplorerService(llm),
    executor,
    new SkillEvolverEvaluatorService(
      llm,
      executor,
      new FixtureCaseEvaluatorService(),
      new DecisionReplayTrajectoryService(),
    ),
    new ContrastiveAnalyzerService(llm),
    new SkillEditorService(llm),
    new IndependentAuditorService(llm),
    llm,
    new SkillEvolverRegressionGateService(),
    new SkillEvolverBatchComparatorService(),
    agentSkills,
  );
  return { engine, agentSkills, registry, llmConnected: !!llmService };
}

export async function shutdownSkillEvolverCli(): Promise<void> {
  await closeLiveE2eReplayContext();
}
