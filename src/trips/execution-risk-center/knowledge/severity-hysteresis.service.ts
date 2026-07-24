import { Injectable, Optional } from '@nestjs/common';
import type { ActiveRisk, ExecutionGate, RiskLevel } from '../types/execution-risk.types';
import {
  computeSeverityHysteresisOutcome,
  type HysteresisStoreEntry,
} from './severity-hysteresis.logic';
import { SeverityHysteresisStoreService } from './severity-hysteresis.store';

export interface SeverityHysteresisState {
  readingsRequired: number;
  readingsConfirmed: number;
  canDowngrade: boolean;
}

@Injectable()
export class SeverityHysteresisService {
  private readonly localStore = new Map<string, HysteresisStoreEntry>();

  constructor(
    @Optional() private readonly persistence?: SeverityHysteresisStoreService,
  ) {}

  async apply(
    risk: Pick<ActiveRisk, 'tripId' | 'riskKey' | 'knowledgeCode' | 'type' | 'level' | 'executionGate'>,
    proposed: { level: RiskLevel; executionGate: ExecutionGate },
  ): Promise<{ level: RiskLevel; executionGate: ExecutionGate; hysteresis?: SeverityHysteresisState }> {
    const key = `${risk.tripId}:${risk.riskKey}`;
    const prior =
      (await this.readEntry(risk.tripId, risk.riskKey)) ??
      ({
        level: risk.level,
        executionGate: risk.executionGate ?? 'ALLOW',
        confirmedImprovementReadings: 0,
        updatedAt: new Date().toISOString(),
      } satisfies HysteresisStoreEntry);

    const outcome = computeSeverityHysteresisOutcome({
      prior,
      proposed,
      isWeather: risk.type === 'ENVIRONMENT',
    });

    await this.writeEntry(risk.tripId, risk.riskKey, outcome.entry, key);
    return {
      level: outcome.level,
      executionGate: outcome.executionGate,
      hysteresis: outcome.hysteresis,
    };
  }

  async reset(tripId: string, riskKey: string): Promise<void> {
    if (this.persistence) {
      await this.persistence.deleteEntry(tripId, riskKey);
      return;
    }
    this.localStore.delete(`${tripId}:${riskKey}`);
  }

  private async readEntry(
    tripId: string,
    riskKey: string,
  ): Promise<HysteresisStoreEntry | undefined> {
    if (this.persistence) {
      return this.persistence.getEntry(tripId, riskKey);
    }
    return this.localStore.get(`${tripId}:${riskKey}`);
  }

  private async writeEntry(
    tripId: string,
    riskKey: string,
    entry: HysteresisStoreEntry,
    cacheKey: string,
  ): Promise<void> {
    if (this.persistence) {
      await this.persistence.setEntry(tripId, riskKey, entry);
      return;
    }
    this.localStore.set(cacheKey, entry);
  }
}
