// src/itinerary-optimization/services/or-tools-tsp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PlaceNode } from '../interfaces/route-optimization.interface';

/** node_or_tools 类型（可选依赖，可能未安装） */
type NodeORTools = {
  TSP: new (opts: { numNodes: number; costs: number[][] }) => {
    Solve: (
      opts: { computeTimeLimit: number; depotNode: number },
      cb: (err: Error | null, solution?: number[]) => void
    ) => void;
  };
};

/**
 * OR-Tools TSP 求解器（可选）
 *
 * 使用 node_or_tools 的 TSP 求解器。若未安装或不可用，返回 null。
 * 安装：npm install node_or_tools（需 Node 兼容或 --build-from-source）
 */
@Injectable()
export class OrToolsTspService {
  private readonly logger = new Logger(OrToolsTspService.name);
  private ortools: NodeORTools | null = null;

  constructor() {
    try {
      this.ortools = require('node_or_tools') as NodeORTools;
    } catch {
      this.logger.debug('node_or_tools 未安装或不可用，将使用模拟退火');
    }
  }

  /**
   * 使用 OR-Tools TSP 求解（若可用）
   * @returns 节点索引顺序，或 null 表示不可用/失败
   */
  async solveTsp(
    places: PlaceNode[],
    getTimeMinutes: (fromId: string, toId: string) => number | null,
    options?: { timeLimitMs?: number; depotIndex?: number }
  ): Promise<number[] | null> {
    if (!this.ortools || places.length < 2) return null;

    const n = places.length;
    const timeLimitMs = options?.timeLimitMs ?? 2000;
    const depotIndex = options?.depotIndex ?? 0;

    const costs: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          row.push(0);
        } else {
          const t = getTimeMinutes(String(places[i].id), String(places[j].id));
          row.push(Math.round((t ?? 30) * 60)); // 转为秒（整数）
        }
      }
      costs.push(row);
    }

    return new Promise((resolve) => {
      try {
        const tsp = new this.ortools!.TSP({ numNodes: n, costs });
        tsp.Solve(
          { computeTimeLimit: timeLimitMs, depotNode: depotIndex },
          (err: Error | null, solution?: number[]) => {
            if (err) {
              this.logger.warn(`OR-Tools TSP 求解失败: ${err.message}`);
              resolve(null);
              return;
            }
            if (solution && solution.length === n) {
              this.logger.debug(`OR-Tools TSP 求解成功：${n} 个节点`);
              resolve(solution);
            } else {
              resolve(null);
            }
          }
        );
      } catch (e) {
        this.logger.warn(`OR-Tools TSP 调用异常: ${e instanceof Error ? e.message : String(e)}`);
        resolve(null);
      }
    });
  }

  isAvailable(): boolean {
    return this.ortools != null;
  }
}
