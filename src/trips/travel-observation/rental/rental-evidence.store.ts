import { Injectable } from '@nestjs/common';
import type { GroundingHints } from '../grounding/grounding.types';
import type { TravelObservationEvent } from '../observation.types';
import { buildRentalEvidencePackage } from './rental-evidence.builder';
import type { RentalEvidencePackage } from './rental-evidence.types';

@Injectable()
export class RentalEvidencePackageStore {
  private readonly byObservation = new Map<string, RentalEvidencePackage>();
  private readonly byId = new Map<string, RentalEvidencePackage>();

  upsertFromObservation(
    event: TravelObservationEvent,
    hints?: GroundingHints,
  ): RentalEvidencePackage {
    const pkg = buildRentalEvidencePackage({ event, hints });
    this.byObservation.set(event.observationId, pkg);
    this.byId.set(pkg.packageId, pkg);
    return { ...pkg };
  }

  getByObservation(observationId: string): RentalEvidencePackage | undefined {
    const p = this.byObservation.get(observationId);
    return p ? { ...p } : undefined;
  }

  get(packageId: string): RentalEvidencePackage | undefined {
    const p = this.byId.get(packageId);
    return p ? { ...p } : undefined;
  }

  clear(): void {
    this.byObservation.clear();
    this.byId.clear();
  }
}
