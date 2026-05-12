import { Injectable } from '@nestjs/common';
import type { OntologyConstraints } from '../nl-clarification/ontology-constraints.types';
import type { FeasibilityResult, SkeletonPlan } from './solver.types';

@Injectable()
export class SolverService {
  /**
   * v0 feasibility pre-check（minimal）
   * - 目的：在 needsClarification 阶段就拦截明显物理不可能的输入。
   * - 当前为启发式 stub：后续替换为真实 solver。
   */
  async checkFeasibility(params: Record<string, any>, ctx?: { destinationCode?: string; constraints?: OntologyConstraints }): Promise<FeasibilityResult> {
    const destinationCode = ctx?.destinationCode;
    const days = this.coerceNumber(params?.days ?? params?.durationDays);
    const destinations = this.extractDestinations(params);

    // Heuristic #1: 多目的地 + 天数过少
    if (destinations.length >= 2 && (days !== undefined && days <= 1)) {
      return {
        isPossible: false,
        conflictReason: {
          code: 'MULTI_DESTINATION_TOO_SHORT',
          message: `当前行程包含多个目的地（${destinations.join('、')}），但天数仅 ${days} 天，物理时间不足。`,
          details: { destinations, days, destinationCode },
        },
        suggestedActions: ['增加行程天数', '减少目的地数量', '仅保留一个城市/区域作为核心目的地'],
      };
    }

    // Heuristic #2: 预算低于 budgetFloor
    const budget = this.coerceNumber(params?.totalBudget ?? params?.budget);
    const currency = String(params?.currency ?? 'CNY');
    const budgetFloor = this.coerceNumber((ctx?.constraints as any)?.budgetFloor);
    if (budgetFloor !== undefined && budget !== undefined && budget < budgetFloor) {
      return {
        isPossible: false,
        conflictReason: {
          code: 'BUDGET_BELOW_FLOOR',
          message: `预算 ${budget} ${currency} 低于该目的地建议最低预算 ${budgetFloor} ${currency}，可能无法保障基本交通/住宿与安全冗余。`,
          details: { budget, currency, budgetFloor, destinationCode },
        },
        suggestedActions: ['提高预算', '缩短行程天数', '降低体验密度/选择更经济的出行方式'],
        suggestedClarifications: [
          { field: 'totalBudget', question: '您的预算上限是多少？（用于保证住宿/交通的基本可行性）' },
        ],
      };
    }

    // Heuristic #3: timeDensity 上限（软提示：在 v0 里不强制 fail）
    const timeDensity = (ctx?.constraints as any)?.timeDensity as { min?: number; max?: number } | undefined;
    const poiCount = this.coerceNumber(params?.poiCount ?? params?.mustHavePois?.length);
    if (timeDensity?.max !== undefined && days !== undefined && poiCount !== undefined) {
      const avg = poiCount / Math.max(1, days);
      if (avg > timeDensity.max) {
        return {
          isPossible: false,
          conflictReason: {
            code: 'TIME_DENSITY_TOO_HIGH',
            message: `当前期望的景点密度约 ${avg.toFixed(1)}/天，超过建议上限 ${timeDensity.max}/天，容易导致赶路与疲劳超标。`,
            details: { poiCount, days, avg, timeDensityMax: timeDensity.max, destinationCode },
          },
          suggestedActions: ['减少必去点数量', '增加天数', '调整为更放松的节奏（pace）'],
        };
      }
    }

    return { isPossible: true };
  }

  /**
   * v0 skeleton solve（minimal）
   * - 当前只返回一个空骨架，供 v2 链路打通；后续替换为 MCTS / MILP / CGUS 等。
   */
  async solveSkeleton(input: {
    destinationCode?: string;
    days?: number;
    constraints?: OntologyConstraints;
    params?: Record<string, any>;
  }): Promise<SkeletonPlan> {
    return {
      version: '0',
      destinationCode: input.destinationCode,
      days: input.days,
      constraints: input.constraints,
      params: input.params,
    };
  }

  private coerceNumber(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private extractDestinations(params: Record<string, any>): string[] {
    const out: string[] = [];
    const d = params?.destination;
    if (typeof d === 'string' && d.trim()) out.push(d.trim());
    const cities = params?.cities;
    if (Array.isArray(cities)) {
      for (const c of cities) {
        if (typeof c === 'string' && c.trim()) out.push(c.trim());
      }
    } else if (typeof cities === 'string' && cities.trim()) {
      out.push(cities.trim());
    }
    // de-dup
    return Array.from(new Set(out));
  }
}

