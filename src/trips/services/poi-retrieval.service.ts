import { Injectable } from '@nestjs/common';
import { PlaceCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ExperienceCandidate, PoiQueryIntent, RepairContract } from '../types/poi-intent-contract.types';

@Injectable()
export class PoiRetrievalService {
  constructor(private readonly prisma: PrismaService) {}

  async retrieveCandidates(intent: PoiQueryIntent, limit = 20): Promise<ExperienceCandidate[]> {
    const countryCode = intent.destinationScope.countryCode?.toUpperCase().trim();
    const atoms = intent.requiredExperienceAtoms.map((x) => x.atom).filter(Boolean);
    const textTerms = [...new Set([...atoms, ...intent.preferredPoiTypes].filter(Boolean))];
    const categories = this.resolveCategories(intent);

    const places = await this.prisma.place.findMany({
      where: {
        ...(countryCode ? { City: { countryCode } } : {}),
        ...(categories.length > 0 ? { category: { in: categories } } : {}),
      },
      include: { City: true },
      take: Math.max(limit * 3, limit),
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
    });

    return places
      .map((place) => {
        const matchedFields = this.resolveMatchedFields(place, textTerms);
        const atomStrength = this.resolveAtomStrength(intent, place, matchedFields);
        const profile = this.resolvePlanningProfile(place.metadata);
        const retrievalScore =
          (typeof place.rating === 'number' ? place.rating : 0) +
          atomStrength * 1.5 +
          this.resolveCategoryBoost(place.category, intent) +
          this.resolvePlanningProfileBoost(profile, intent);

        return {
          candidateId: `poi_candidate_${randomUUID()}`,
          source: 'POI_DATABASE' as const,
          poiId: String(place.id),
          proposedExperienceAtoms: this.resolveProposedExperienceAtoms(intent, atomStrength),
          intendedParticipants: this.resolveParticipants(intent),
          itineraryRole: this.resolveItineraryRole(place.category, atomStrength, profile),
          expectedDwellMinutes: this.extractExpectedDwellMinutes(place.metadata) ?? profile.dwellMinutes,
          retrievalContext: {
            queryId: intent.queryId,
            matchedFields,
            retrievalScore,
          },
          evidenceRefs: this.resolveEvidenceRefs(place),
        };
      })
      .sort((a, b) => b.retrievalContext.retrievalScore - a.retrievalContext.retrievalScore)
      .slice(0, limit);
  }

  buildReplacementQueryFromRepair(repair: RepairContract, base: PoiQueryIntent): PoiQueryIntent {
    return {
      ...base,
      queryId: `repair_${base.queryId}_${Date.now()}`,
      destinationScope: {
        ...base.destinationScope,
        routeCorridorId: repair.replacementSearchSpace.routeCorridorId ?? base.destinationScope.routeCorridorId,
      },
      requiredExperienceAtoms: repair.preserveGoals.map((atom) => ({ atom, weight: 1 })),
      contextualConstraints: {
        ...base.contextualConstraints,
        maxDetourMinutes: repair.replacementSearchSpace.maxDetourMinutes ?? base.contextualConstraints.maxDetourMinutes,
        vehicleType: repair.replacementSearchSpace.vehicleAccess?.[0] ?? base.contextualConstraints.vehicleType,
      },
    };
  }

  private resolveParticipants(intent: PoiQueryIntent): string[] {
    const participants = ['ADULTS'];
    if (intent.audienceRequirements.elderlyFriendly) participants.push('ELDERLY');
    if (intent.audienceRequirements.childFriendly) participants.push('CHILDREN');
    return participants;
  }

  private extractExpectedDwellMinutes(metadata: unknown): number | undefined {
    const m = metadata as Record<string, any> | null;
    const value = m?.recommendedDwellMinutes ?? m?.dwellMinutes ?? m?.durationMinutes;
    return typeof value === 'number' ? value : undefined;
  }

  private resolvePlanningProfile(metadata: unknown): Record<string, any> {
    const m = metadata as Record<string, any> | null;
    return ((m?.planningProfile as Record<string, any>) || {}) as Record<string, any>;
  }

  private resolveCategories(intent: PoiQueryIntent): PlaceCategory[] {
    const categories = new Set<PlaceCategory>();
    const tokens = [
      ...intent.requiredExperienceAtoms.map((x) => x.atom),
      ...intent.preferredPoiTypes,
    ].map((x) => x.toLowerCase());

    const has = (...values: string[]) => tokens.some((token) => values.some((value) => token.includes(value)));
    if (has('food', 'restaurant', 'dining', 'meal', '美食', '餐厅')) categories.add(PlaceCategory.RESTAURANT);
    if (has('shop', 'shopping', '购物')) categories.add(PlaceCategory.SHOPPING);
    if (has('hotel', '住宿')) categories.add(PlaceCategory.HOTEL);
    if (has('transit', 'airport', 'station', '交通')) categories.add(PlaceCategory.TRANSIT_HUB);

    categories.add(PlaceCategory.ATTRACTION);
    if (categories.size === 1 && tokens.length === 0) categories.add(PlaceCategory.RESTAURANT);
    return [...categories];
  }

  private resolveMatchedFields(
    place: {
      nameCN: string;
      nameEN: string | null;
      description: string | null;
      category: PlaceCategory;
      metadata: unknown;
    },
    terms: string[],
  ): string[] {
    const matched: string[] = [`category:${place.category}`];
    if (terms.length === 0) return [...matched, 'destination_scope'];
    const haystacks: Array<[string, string]> = [
      ['nameCN', place.nameCN],
      ['nameEN', place.nameEN || ''],
      ['description', place.description || ''],
      ['metadata', JSON.stringify(place.metadata || {})],
      ['planningProfile', JSON.stringify(this.resolvePlanningProfile(place.metadata))],
    ];
    for (const [field, value] of haystacks) {
      if (terms.some((term) => value.toLowerCase().includes(term.toLowerCase()))) matched.push(field);
    }
    if (matched.length === 1) matched.push('destination_scope');
    return matched;
  }

  private resolveAtomStrength(
    intent: PoiQueryIntent,
    place: {
      nameCN: string;
      nameEN: string | null;
      description: string | null;
      category: PlaceCategory;
      metadata: unknown;
    },
    matchedFields: string[],
  ): number {
    if (intent.requiredExperienceAtoms.length === 0) return 0.4;
    const profile = this.resolvePlanningProfile(place.metadata);
    const text = `${place.nameCN} ${place.nameEN || ''} ${place.description || ''} ${JSON.stringify(profile)}`.toLowerCase();
    const matchedAtoms = intent.requiredExperienceAtoms.filter(({ atom }) => text.includes(atom.toLowerCase()));
    const categoryMatched =
      (place.category === PlaceCategory.RESTAURANT &&
        intent.requiredExperienceAtoms.some(({ atom }) => ['food', 'restaurant'].includes(atom))) ||
      (place.category === PlaceCategory.SHOPPING &&
        intent.requiredExperienceAtoms.some(({ atom }) => ['shopping', 'shop'].includes(atom))) ||
      place.category === PlaceCategory.ATTRACTION;

    const directStrength = matchedAtoms.reduce((sum, atom) => sum + Math.max(0.1, Math.min(1, atom.weight)), 0);
    const categoryStrength = categoryMatched ? 0.35 : 0;
    const fieldStrength = matchedFields.some((field) => ['nameCN', 'nameEN', 'description', 'metadata'].includes(field)) ? 0.25 : 0;
    return Math.min(1, Math.max(0.2, directStrength + categoryStrength + fieldStrength));
  }

  private resolveProposedExperienceAtoms(intent: PoiQueryIntent, atomStrength: number): ExperienceCandidate['proposedExperienceAtoms'] {
    if (intent.requiredExperienceAtoms.length === 0) {
      return [{ atom: 'general_sightseeing', expectedStrength: Math.max(0.2, atomStrength) }];
    }
    return intent.requiredExperienceAtoms.map((atom) => ({
      atom: atom.atom,
      expectedStrength: Math.max(0.1, Math.min(1, atom.weight * atomStrength)),
    }));
  }

  private resolveCategoryBoost(category: PlaceCategory, intent: PoiQueryIntent): number {
    const requestedFood = intent.preferredPoiTypes.some((x) => ['food', 'restaurant'].includes(x.toLowerCase()));
    const requestedShopping = intent.preferredPoiTypes.some((x) => ['shopping', 'shop'].includes(x.toLowerCase()));
    if (category === PlaceCategory.RESTAURANT && requestedFood) return 0.8;
    if (category === PlaceCategory.SHOPPING && requestedShopping) return 0.6;
    if (category === PlaceCategory.ATTRACTION) return 0.4;
    return 0;
  }

  private resolvePlanningProfileBoost(profile: Record<string, any>, intent: PoiQueryIntent): number {
    let boost = 0;
    const tags = Array.isArray(profile.experienceTags)
      ? profile.experienceTags.map((tag: unknown) => String(tag).toLowerCase())
      : [];
    const atoms = intent.requiredExperienceAtoms.map((atom) => atom.atom.toLowerCase());

    for (const atom of atoms) {
      if (tags.includes(atom) || String(profile.canonicalType || '').toLowerCase().includes(atom)) {
        boost += 0.8;
      }
    }

    if (intent.loadLimits.maxPhysicalEffort != null && typeof profile.physicalLoad === 'number') {
      boost += profile.physicalLoad <= intent.loadLimits.maxPhysicalEffort ? 0.8 : -1.2;
    }
    if (intent.audienceRequirements.childFriendly && profile.childFriendly === true) boost += 0.6;
    if (intent.audienceRequirements.elderlyFriendly && profile.elderlyFriendly === true) boost += 0.6;
    if (profile.visitRole === 'anchor') boost += 0.5;
    if (profile.visitRole === 'backup') boost -= 0.3;
    if (profile.reservationRequired === false) boost += 0.15;
    return boost;
  }

  private resolveItineraryRole(
    category: PlaceCategory,
    atomStrength: number,
    profile: Record<string, any>,
  ): ExperienceCandidate['itineraryRole'] {
    if (profile.visitRole === 'anchor') return 'ANCHOR';
    if (profile.visitRole === 'meal' || profile.visitRole === 'flex') return 'FLEXIBLE';
    if (profile.visitRole === 'backup') return 'RECOMMENDED';
    if (category === PlaceCategory.ATTRACTION && atomStrength >= 0.55) return 'ANCHOR';
    if (category === PlaceCategory.RESTAURANT || category === PlaceCategory.SHOPPING) return 'FLEXIBLE';
    return 'RECOMMENDED';
  }

  private resolveEvidenceRefs(place: { id: number; lastVerifiedAt: Date | null; dataSource: string | null }): string[] {
    const refs = [`place:${place.id}`];
    if (place.dataSource) refs.push(`source:${place.dataSource}`);
    if (place.lastVerifiedAt) refs.push(`verified:${place.lastVerifiedAt.toISOString()}`);
    return refs;
  }
}
