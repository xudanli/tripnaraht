#!/usr/bin/env npx tsx
/**
 * 一键 pipeline：export-e2e（可选）→ evolve → export-agent-skills → validate
 *
 *   npm run skill-evolver:pipeline -- --skill api_calling --replay-case api-smoke --eval fixture --dry-run
 *   npm run skill-evolver:pipeline -- --skill country_pack.IS --replay-case iceland-highlands-dem-missing --seed weak --max-rounds 2
 *
 * 加载项目 .env 中的 DeepSeek/OpenAI 等配置，无需启动 Nest HTTP 服务。
 */
import { execSync } from 'child_process';
import { createSkillEvolverEngine, shutdownSkillEvolverCli } from './skill-evolver-cli-bootstrap';
import type { SkillEvolverEvalMode } from '../src/agent/training/skill-evolver/interfaces/skill-evolver.types';

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skillId = String(args.skill ?? '');
  if (!skillId) {
    process.stderr.write(
      'Usage: skill-evolver-pipeline.ts --skill <id> (--tasks <batch> | --replay-case <case>) [--dry-run] [--export-e2e-first]\n',
    );
    process.exit(1);
  }

  if (args.export_e2e_first) {
    execSync('npx tsx scripts/export-e2e-to-skill-evolver-replay.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  }

  const verbose = args.verbose === true || args.verbose === 'true';
  const { engine, agentSkills, llmConnected } = createSkillEvolverEngine({ verbose });
  const dryRun = args.dry_run === true || args.dry_run === 'true';
  const evalMode = args.eval as SkillEvolverEvalMode | undefined;

  const noDecisionReplay = args.no_decision_replay === true || args.no_decision_replay === 'true';
  const liveReplay = args.live === true || args.live === 'true';
  const syncReadiness =
    args.sync_readiness === true ||
    args.sync_readiness === 'true' ||
    skillId.startsWith('country_pack.');

  const result = await engine.evolve(skillId, {
    taskBatchId: args.tasks ? String(args.tasks) : undefined,
    replayCaseId: args.replay_case ? String(args.replay_case) : undefined,
    maxRounds: args.max_rounds ? Number(args.max_rounds) : 3,
    dryRun,
    evalMode,
    exportAgentSkills: false,
    seedId: args.seed ? String(args.seed) : undefined,
    useDecisionReplay: noDecisionReplay ? false : undefined,
    liveDecisionReplay: liveReplay ? true : undefined,
    verbose,
  });

  const seedNote = args.seed ? ` seed=${args.seed}` : '';
  const replayNote = noDecisionReplay ? ' decision_replay=off' : '';
  const liveNote = liveReplay ? ' live=on' : '';
  const improved =
    result.finalScore > result.initialScore ||
    result.finalVersion > result.initialVersion;

  process.stdout.write(
    `[pipeline] evolve v${result.initialVersion}->v${result.finalVersion} score ${result.initialScore}->${result.finalScore} llm=${llmConnected}${seedNote}${replayNote}${liveNote} mode=${result.evalMode}\n`,
  );

  if (!dryRun && improved) {
    const exported = agentSkills.export([skillId]);
    process.stdout.write(`[pipeline] exported (improved) -> ${exported.exportRoot}\n`);

    if (syncReadiness && skillId.startsWith('country_pack.')) {
      const cc = skillId.split('.')[1] ?? 'IS';
      execSync(
        `npx tsx scripts/sync-skill-evolver-country-pack-to-readiness.ts --country ${cc}`,
        { stdio: 'inherit', cwd: process.cwd() },
      );
    }
  } else if (!dryRun) {
    process.stdout.write('[pipeline] skip export (no score/version improvement)\n');
  }

  const validation = agentSkills.validate();
  process.stdout.write(
    `[pipeline] validate errors=${validation.errorCount} warnings=${validation.warnCount}\n`,
  );

  if (validation.errorCount > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => shutdownSkillEvolverCli());
