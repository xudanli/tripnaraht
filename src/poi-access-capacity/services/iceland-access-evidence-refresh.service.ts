/**
 * 按 scope 刷新 POI Access 证据（validate-scope）
 */

import { Injectable, Logger } from '@nestjs/common';
import { IcelandPoiAccessSyncService } from './iceland-poi-access-sync.service';
import { IcelandCapacitySyncService } from './iceland-capacity-sync.service';

export type AccessEvidenceRefreshScope =
  | 'access_rules'
  | 'access_inventory'
  | 'access_congestion';

export type AccessEvidenceRefreshResult = {
  scopes: AccessEvidenceRefreshScope[];
  rules?: { overridesUpserted: number };
  inventory?: { snapshotsUpserted: number };
  congestion?: { note: string };
};

@Injectable()
export class IcelandAccessEvidenceRefreshService {
  private readonly logger = new Logger(IcelandAccessEvidenceRefreshService.name);

  constructor(
    private readonly accessSync: IcelandPoiAccessSyncService,
    private readonly capacitySync: IcelandCapacitySyncService,
  ) {}

  async refresh(scopes: AccessEvidenceRefreshScope[]): Promise<AccessEvidenceRefreshResult> {
    const unique = [...new Set(scopes)];
    const result: AccessEvidenceRefreshResult = { scopes: unique };

    for (const scope of unique) {
      switch (scope) {
        case 'access_rules': {
          const sync = await this.accessSync.syncAll();
          result.rules = {
            overridesUpserted:
              sync.vatnajokull.overridesUpserted + sync.dyrholaey.overridesUpserted,
          };
          break;
        }
        case 'access_inventory': {
          const cap = await this.capacitySync.syncFromSeedFile();
          result.inventory = { snapshotsUpserted: cap.snapshotsUpserted };
          break;
        }
        case 'access_congestion':
          result.congestion = {
            note: 'M1：拥堵层依赖模型/USER 反馈，无独立 pull API；已跳过远程刷新',
          };
          this.logger.debug('access_congestion refresh noop (M1)');
          break;
        default:
          break;
      }
    }

    return result;
  }

  normalizeForceRefresh(
    forceRefreshEvidence?: boolean | AccessEvidenceRefreshScope[],
  ): AccessEvidenceRefreshScope[] {
    if (forceRefreshEvidence === true) {
      return ['access_rules', 'access_inventory', 'access_congestion'];
    }
    if (Array.isArray(forceRefreshEvidence)) {
      return forceRefreshEvidence;
    }
    return [];
  }
}
