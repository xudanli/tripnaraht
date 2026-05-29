#!/usr/bin/env npx tsx
/**
 * SkillEvolver Lite CLI — 加载 .env 后使用 DeepSeek 等 LLM
 *
 *   npm run skill-evolver:evolve -- --skill api_calling --tasks api-smoke --dry-run
 *   npm run skill-evolver:evolve -- --skill api_calling --replay-case api-smoke --eval fixture
 */
import type { SkillEvolverEvalMode } from '../src/agent/training/skill-evolver/interfaces/skill-evolver.types';
import { createSkillEvolverEngine, shutdownSkillEvolverCli } from './skill-evolver-cli-bootstrap';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function bootstrap(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skillId = String(args.skill ?? '');
  if (!skillId) {
    process.stderr.write(
      'Usage: skill-evolver-evolve.ts --skill <id> (--tasks <batchId> | --replay-case <caseId>) ' +
        '[--dry-run] [--max-rounds N] [--eval llm|fixture|decision_replay] [--seed weak] ' +
        '[--no-decision-replay] [--live] [--verbose]\n',
    );
    process.exit(1);
  }

  const verbose = args.verbose === true || args.verbose === 'true';
  const { engine, llmConnected } = createSkillEvolverEngine({ verbose });
  const evalMode = args.eval as SkillEvolverEvalMode | undefined;

  const noDecisionReplay = args.no_decision_replay === true || args.no_decision_replay === 'true';
  const liveReplay = args.live === true || args.live === 'true';

  const result = await engine.evolve(skillId, {
    taskBatchId: args.tasks ? String(args.tasks) : undefined,
    replayCaseId: args.replay_case ? String(args.replay_case) : undefined,
    maxRounds: args.max_rounds ? Number(args.max_rounds) : 3,
    strategyCount: args.strategy_count ? Number(args.strategy_count) : 4,
    minScoreDelta: args.min_score_delta ? Number(args.min_score_delta) : 1,
    dryRun: args.dry_run === true || args.dry_run === 'true',
    evalMode,
    regressionGate: args.regression_gate !== false && args.regression_gate !== 'false',
    seedId: args.seed ? String(args.seed) : undefined,
    useDecisionReplay: noDecisionReplay ? false : undefined,
    liveDecisionReplay: liveReplay ? true : undefined,
    verbose,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const improved = result.finalScore > result.initialScore;
  process.stdout.write(
    `[SkillEvolver] ${skillId} v${result.initialVersion}->v${result.finalVersion} ` +
      `score ${result.initialScore}->${result.finalScore} mode=${result.evalMode} llm=${llmConnected} improved=${improved}\n`,
  );
  process.exit(0);
}

bootstrap()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => shutdownSkillEvolverCli());
