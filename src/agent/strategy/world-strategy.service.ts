import { Injectable } from '@nestjs/common';
import icelandV1 from '../../assets/strategy/iceland-v1.json';
import type { IcelandStrategyDocumentV1 } from './world-strategy.types';

/**
 * 单一策略源入口：Gate / 仲裁只读消费，不写散落的魔法常量。
 */
@Injectable()
export class WorldStrategyService {
  private icelandV1: IcelandStrategyDocumentV1 | null = null;

  getIcelandStrategyV1(): IcelandStrategyDocumentV1 {
    if (!this.icelandV1) {
      this.icelandV1 = icelandV1 as IcelandStrategyDocumentV1;
    }
    return this.icelandV1;
  }

  /** 单测 / 热重载预留 */
  resetIcelandCacheForTests(): void {
    this.icelandV1 = null;
  }
}
