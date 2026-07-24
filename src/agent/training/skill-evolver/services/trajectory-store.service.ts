import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { SkillTrajectory } from '../interfaces/skill-evolver.types';
import { SkillRegistryService } from './skill-registry.service';

@Injectable()
export class TrajectoryStoreService {
  private readonly logger = new Logger(TrajectoryStoreService.name);

  constructor(private readonly registry: SkillRegistryService) {}

  private trajectoriesDir(): string {
    return path.join(this.registry.getBasePath(), 'trajectories');
  }

  ensureLayout(): void {
    const dir = this.trajectoriesDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  save(trajectory: SkillTrajectory): string {
    this.ensureLayout();
    const id = trajectory.trajectoryId || randomUUID();
    const record = { ...trajectory, trajectoryId: id };
    const file = path.join(this.trajectoriesDir(), `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf-8');
    this.logger.debug(`[TrajectoryStore] saved ${id}`);
    return id;
  }

  load(trajectoryId: string): SkillTrajectory {
    const file = path.join(this.trajectoriesDir(), `${trajectoryId}.json`);
    if (!fs.existsSync(file)) throw new Error(`轨迹不存在: ${trajectoryId}`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SkillTrajectory;
  }

  listBySkill(skillId: string, limit = 50): SkillTrajectory[] {
    this.ensureLayout();
    const dir = this.trajectoriesDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const all: SkillTrajectory[] = [];
    for (const f of files) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as SkillTrajectory;
        if (t.skillId === skillId) all.push(t);
      } catch {
        /* skip corrupt */
      }
    }
    return all
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }
}
