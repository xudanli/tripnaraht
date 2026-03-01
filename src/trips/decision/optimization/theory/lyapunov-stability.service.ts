/**
 * Lyapunov 决策系统稳定性服务
 *
 * 专利 3.13.14：V_k = E[U* − U(π_k)]，若 V_{k+1} ≤ V_k 则渐近稳定
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.14
 */

import { Injectable } from '@nestjs/common';
import {
  ILyapunovStabilityService,
  LyapunovInput,
} from './lyapunov-stability.interface';

@Injectable()
export class LyapunovStabilityService implements ILyapunovStabilityService {
  /**
   * 计算 Lyapunov 函数值 V_k = E[U* − U(π_k)]
   */
  computeLyapunov(input: LyapunovInput): number {
    const { optimalUtility, currentUtility } = input;
    return Math.max(0, optimalUtility - currentUtility);
  }

  /**
   * 检查稳定性：V_{k+1} ≤ V_k
   */
  checkStability(vNew: number, vPrev: number): boolean {
    return vNew <= vPrev + 1e-9; // 数值容差
  }
}
