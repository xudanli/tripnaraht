import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type {
  EvolvableArtifactType,
  EvolvableSkill,
  SkillEvolverEvalMode,
  SkillRegistryFile,
  SkillRegistryEntry,
} from '../interfaces/skill-evolver.types';
import { parseSkillMarkdown, serializeSkillMarkdown } from '../utils/markdown-skill.util';

@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly basePath: string;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.basePath =
      this.configService?.get<string>('SKILL_EVOLVER_BASE_PATH')?.trim() ||
      process.env.SKILL_EVOLVER_BASE_PATH?.trim() ||
      path.join(process.cwd(), 'data/skill-evolver');
  }

  getBasePath(): string {
    return this.basePath;
  }

  private registryPath(): string {
    return path.join(this.basePath, 'skill_registry.json');
  }

  private currentDir(artifactType: EvolvableArtifactType = 'markdown_skill'): string {
    if (artifactType === 'country_pack') {
      return path.join(this.basePath, 'artifacts', 'country-pack', 'current');
    }
    return path.join(this.basePath, 'current');
  }

  private versionDir(version: number, artifactType: EvolvableArtifactType = 'markdown_skill'): string {
    if (artifactType === 'country_pack') {
      return path.join(this.basePath, 'artifacts', 'country-pack', 'versions', `v${version}`);
    }
    return path.join(this.basePath, 'versions', `v${version}`);
  }

  resolveSkillFileName(skillId: string, countryCode?: string): string {
    if (countryCode) return `${countryCode}.md`;
    return `${skillId}.md`;
  }

  ensureLayout(): void {
    for (const dir of [
      this.basePath,
      this.currentDir(),
      this.currentDir('country_pack'),
      path.join(this.basePath, 'versions'),
      path.join(this.basePath, 'artifacts', 'country-pack', 'versions'),
      path.join(this.basePath, 'trajectories'),
      path.join(this.basePath, 'tasks'),
      path.join(this.basePath, 'replay-cases'),
    ]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.registryPath())) {
      const empty: SkillRegistryFile = { skills: {}, evolution_history: [] };
      fs.writeFileSync(this.registryPath(), JSON.stringify(empty, null, 2), 'utf-8');
    }
  }

  loadRegistry(): SkillRegistryFile {
    this.ensureLayout();
    const raw = fs.readFileSync(this.registryPath(), 'utf-8');
    return JSON.parse(raw) as SkillRegistryFile;
  }

  private saveRegistry(registry: SkillRegistryFile): void {
    fs.writeFileSync(this.registryPath(), JSON.stringify(registry, null, 2), 'utf-8');
  }

  listSkillIds(): string[] {
    const registry = this.loadRegistry();
    return Object.keys(registry.skills);
  }

  load(skillId: string, artifactType?: EvolvableArtifactType): EvolvableSkill {
    this.ensureLayout();
    const reg = this.loadRegistry().skills[skillId];
    const type = artifactType ?? reg?.artifactType ?? 'markdown_skill';
    const fileName = this.resolveSkillFileName(skillId, reg?.countryCode ?? (type === 'country_pack' ? skillId.replace(/^country_pack\./, '') : undefined));
    const filePath = path.join(this.currentDir(type), fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`技能不存在: ${skillId} (${filePath})`);
    }
    return parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), filePath);
  }

  /** 演示/回归：从 seeds 目录加载弱版本 skill，不覆盖 current */
  loadSeed(skillId: string, seedId: string, artifactType?: EvolvableArtifactType): EvolvableSkill {
    const reg = this.loadRegistry().skills[skillId];
    const type = artifactType ?? reg?.artifactType ?? 'markdown_skill';
    const candidates = [
      path.join(this.basePath, 'seeds', `${skillId}.${seedId}.md`),
      path.join(this.basePath, 'seeds', `${seedId}.md`),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) {
      throw new Error(`Seed 不存在: ${skillId}.${seedId} (${candidates.join(' | ')})`);
    }
    const skill = parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), filePath);
    skill.version = 1;
    return skill;
  }

  loadVersion(skillId: string, version: number, artifactType?: EvolvableArtifactType): EvolvableSkill {
    const reg = this.loadRegistry().skills[skillId];
    const type = artifactType ?? reg?.artifactType ?? 'markdown_skill';
    const fileName = this.resolveSkillFileName(skillId, reg?.countryCode);
    const filePath = path.join(this.versionDir(version, type), fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`技能版本不存在: ${skillId} v${version}`);
    }
    return parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), filePath);
  }

  save(
    skill: EvolvableSkill,
    meta?: {
      scoreDelta?: number;
      strategiesTested?: string[];
      auditPassed?: boolean;
      evalMode?: SkillEvolverEvalMode;
    },
  ): void {
    this.ensureLayout();
    const type = skill.artifactType;
    const fileName = this.resolveSkillFileName(skill.skillId, skill.countryCode);
    const vDir = this.versionDir(skill.version, type);
    if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });

    const versionFile = path.join(vDir, fileName);
    const currentFile = path.join(this.currentDir(type), fileName);
    const content = serializeSkillMarkdown({ frontmatter: skill.frontmatter, body: skill.body });

    fs.writeFileSync(versionFile, content, 'utf-8');
    fs.writeFileSync(currentFile, content, 'utf-8');

    const registry = this.loadRegistry();
    const prev = registry.skills[skill.skillId];
    const versions = new Set([...(prev?.versions ?? []), skill.version]);
    registry.skills[skill.skillId] = {
      name: skill.name,
      currentVersion: skill.version,
      versions: Array.from(versions).sort((a, b) => a - b),
      artifactType: skill.artifactType,
      countryCode: skill.countryCode,
      successRate: prev?.successRate,
      lastEvaluated: new Date().toISOString(),
      evolutionCount: (prev?.evolutionCount ?? 0) + (meta?.scoreDelta != null && meta.scoreDelta > 0 ? 1 : 0),
    } satisfies SkillRegistryEntry;

    if (meta?.scoreDelta != null && skill.parentVersion != null) {
      registry.evolution_history.push({
        skill_id: skill.skillId,
        from_version: skill.parentVersion,
        to_version: skill.version,
        timestamp: new Date().toISOString(),
        score_delta: meta.scoreDelta,
        audit_passed: meta.auditPassed ?? true,
        strategies_tested: meta.strategiesTested ?? [],
        eval_mode: meta.evalMode,
      });
    }

    this.saveRegistry(registry);
    this.logger.log(`[SkillRegistry] saved ${skill.skillId} v${skill.version}`);
  }

  registerNew(skill: EvolvableSkill): void {
    this.save(skill);
  }

  loadTaskBatch(batchId: string): import('../interfaces/skill-evolver.types').TaskBatchFile {
    const file = path.join(this.basePath, 'tasks', `${batchId}.json`);
    if (!fs.existsSync(file)) throw new Error(`任务批次不存在: ${batchId}`);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data.tasks?.length) throw new Error(`任务批次为空: ${batchId}`);
    return data;
  }

  loadReplayCase(caseId: string): import('../interfaces/skill-evolver.types').ReplayCaseFixture {
    const resolvedId = this.resolveReplayCaseId(caseId);
    const file = path.join(this.basePath, 'replay-cases', `${resolvedId}.json`);
    if (!fs.existsSync(file)) throw new Error(`Replay case 不存在: ${caseId}`);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data.tasks?.length) throw new Error(`Replay case 无任务: ${caseId}`);
    data.caseId = data.caseId ?? resolvedId;
    return data;
  }

  /** 支持短别名，如 iceland-highlands-dem-missing → iceland-highlands-dem-missing-001 */
  resolveReplayCaseId(caseId: string): string {
    const replayDir = path.join(this.basePath, 'replay-cases');
    const direct = path.join(replayDir, `${caseId}.json`);
    if (fs.existsSync(direct)) return caseId;

    const with001 = path.join(replayDir, `${caseId}-001.json`);
    if (fs.existsSync(with001)) return `${caseId}-001`;

    const indexPath = path.join(replayDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
        cases?: Array<{ caseId: string; source_e2e_case_id?: string }>;
      };
      const hit = index.cases?.find(
        (c) =>
          c.caseId === caseId ||
          c.caseId.startsWith(`${caseId}-`) ||
          c.source_e2e_case_id === caseId ||
          c.source_e2e_case_id?.startsWith(`${caseId}-`),
      );
      if (hit?.caseId) return hit.caseId;
    }

    return caseId;
  }

  resolveTasksAndAssertions(options: {
    tasks?: import('../interfaces/skill-evolver.types').SkillEvolverTask[];
    taskBatchId?: string;
    replayCaseId?: string;
  }): {
    tasks: import('../interfaces/skill-evolver.types').SkillEvolverTask[];
    assertions?: import('../interfaces/skill-evolver.types').ReplayAssertion[];
    sourceE2eCaseId?: string;
  } {
    if (options.tasks?.length) return { tasks: options.tasks };
    if (options.replayCaseId) {
      const c = this.loadReplayCase(options.replayCaseId);
      const sourceE2eCaseId = c.source_e2e_case_id ?? c.tasks[0]?.id;
      return { tasks: c.tasks, assertions: c.assertions, sourceE2eCaseId };
    }
    if (options.taskBatchId) {
      const b = this.loadTaskBatch(options.taskBatchId);
      return { tasks: b.tasks, assertions: b.assertions };
    }
    throw new Error('需提供 tasks、taskBatchId 或 replayCaseId');
  }
}
