// src/skills/interfaces/skill.interface.ts
/**
 * Skill 接口定义
 * 
 * Skills = 能力颗粒，最小可复用的能力单元
 * 每个 Skill 只做一件"决策上有意义的事"
 */

export interface SkillInput {
  [key: string]: any;
}

export interface SkillOutput {
  [key: string]: any;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
    category: 'decision' | 'dem' | 'routeDirection' | 'countryPack' | 'readiness' | 'whatIf' | 'analytics' | 'rag' | 'world' | 'trip';
}

export interface Skill<TInput extends SkillInput = SkillInput, TOutput extends SkillOutput = SkillOutput> {
  metadata: SkillMetadata;
  execute(input: TInput): Promise<TOutput>;
}

