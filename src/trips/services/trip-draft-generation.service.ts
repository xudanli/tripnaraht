import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TripDraftService } from './trip-draft.service';
import { PoiRetrievalService } from './poi-retrieval.service';
import { RouteTemplatePlanningService, type MatchedRouteTemplate } from './route-template-planning.service';
import { CreateTripDraftDto } from '../dto/trip-draft.dto';
import type { ExperienceCandidate, PoiQueryIntent } from '../types/poi-intent-contract.types';

type GenerationProgress = {
  status: 'generating' | 'completed' | 'failed';
  stage: string;
  message: string;
  itemsCount?: number;
};

@Injectable()
export class TripDraftGenerationService {
  private readonly logger = new Logger(TripDraftGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripDraftService: TripDraftService,
    private readonly poiRetrievalService: PoiRetrievalService,
    private readonly routeTemplatePlanningService: RouteTemplatePlanningService,
    private readonly configService: ConfigService,
  ) {}

  async startAsync(tripId: string, draftDto: CreateTripDraftDto): Promise<void> {
    this.generate(tripId, draftDto).catch((error: any) => {
      this.logger.error(`后台生成行程规划点失败 (tripId: ${tripId}): ${error?.message}`, error?.stack);
    });
  }

  async generate(tripId: string, draftDto: CreateTripDraftDto): Promise<void> {
    try {
      this.logger.log(`开始为行程 ${tripId} 生成行程规划点`);

      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'retrieving_candidates',
        message: '正在检索候选地点...',
      });

      const seedFromTripId = (id: string): number => {
        let h = 0x811c9dc5;
        for (let i = 0; i < id.length; i++) {
          h ^= id.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
      };

      const useAlgorithmicDraft =
        draftDto.useAlgorithmicDraft ?? (this.configService.get<string>('USE_LLM_DRAFT') !== 'true');
      const effectiveDto: CreateTripDraftDto = {
        ...draftDto,
        useAlgorithmicDraft,
        draftRuntimeMode: draftDto.draftRuntimeMode ?? (useAlgorithmicDraft ? 'ALGO' : 'HYBRID'),
      };
      (effectiveDto as any).seed = seedFromTripId(tripId);

      const poiIntent = await this.buildPoiQueryIntent(tripId, effectiveDto);
      const matchedTemplates = await this.routeTemplatePlanningService.findBestTemplates(
        poiIntent,
        effectiveDto.days,
        3,
      );
      await this.persistTemplateSnapshot(tripId, matchedTemplates);
      const templatePoiNames = await this.resolveTemplatePoiNames(matchedTemplates);
      if (!effectiveDto.routeDirectionId && matchedTemplates[0]?.routeDirectionId) {
        effectiveDto.routeDirectionId = String(matchedTemplates[0].routeDirectionId);
      }
      const experienceCandidates = await this.poiRetrievalService.retrieveCandidates(poiIntent, 80);
      await this.persistCandidateSnapshot(tripId, poiIntent, experienceCandidates);
      if (experienceCandidates.length < 8) {
        await this.markRepairRequired(tripId, poiIntent, experienceCandidates);
        return;
      }

      effectiveDto.mustHavePois = this.mergeMustHavePoiNames(
        this.mergeMustHavePoiNames(effectiveDto.mustHavePois, templatePoiNames),
        await this.resolveCandidatePoiNames(experienceCandidates.slice(0, 12)),
      );

      const draft = await this.tripDraftService.generateDraft(
        effectiveDto,
        (progress) => this.updateGenerationProgress(tripId, progress),
        undefined,
        { tripId, mode: 'BOOTSTRAP' },
      );

      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'saving_items',
        message: '草案生成完成，正在保存行程项...',
      });

      const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(tripId, draft);

      await this.markGenerationComplete(tripId, itemsCount);
      this.logger.log(`成功为行程 ${tripId} 生成 ${itemsCount} 个行程项`);
    } catch (error: any) {
      await this.updateGenerationProgress(tripId, {
        status: 'failed',
        stage: 'error',
        message: `生成失败: ${error?.message || 'unknown error'}`,
      }).catch((updateError: any) => {
        this.logger.error(`更新生成失败状态失败: ${updateError?.message}`);
      });
      throw error;
    }
  }

  async updateGenerationProgress(tripId: string, progress: GenerationProgress): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      this.logger.warn(`行程 ${tripId} 不存在，无法更新生成进度`);
      return;
    }

    const metadata = ((trip.metadata as Record<string, any>) || {}) as Record<string, any>;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          generatingItems: progress.status === 'generating',
          lifecycleStatus:
            progress.status === 'completed'
              ? 'ITINERARY_DRAFTED'
              : progress.status === 'failed'
                ? metadata.lifecycleStatus
                : 'STRATEGY_DRAFTED',
          planningReadiness:
            progress.status === 'completed'
              ? 'READY_FOR_ITINERARY'
              : metadata.planningReadiness || 'READY_FOR_ITINERARY',
          planningStages: {
            ...(metadata.planningStages || {}),
            strategyGenerated: progress.status !== 'failed',
            itineraryGenerated: progress.status === 'completed',
          },
          generationProgress: {
            ...progress,
            updatedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      },
    });
  }

  private async buildPoiQueryIntent(tripId: string, draftDto: CreateTripDraftDto): Promise<PoiQueryIntent> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const metadata = ((trip?.metadata as Record<string, any>) || {}) as Record<string, any>;
    const nlDraft = (metadata.nlDraft || {}) as Record<string, any>;
    const partial = (nlDraft.partialParams || {}) as Record<string, any>;
    const rawUserIntent = typeof nlDraft.rawUserIntent === 'string' ? nlDraft.rawUserIntent : draftDto.userInput || '';
    const atoms = this.extractExperienceAtoms(rawUserIntent, partial);
    const preferredPoiTypes = this.resolvePreferredPoiTypes(draftDto, atoms);

    return {
      queryId: `trip_${tripId}_initial_poi_${Date.now()}`,
      destinationScope: {
        countryCode: draftDto.destination,
      },
      requiredExperienceAtoms: atoms.map((atom) => ({ atom, weight: 1 })),
      preferredPoiTypes,
      audienceRequirements: {
        elderlyFriendly: Array.isArray(partial.companions) && partial.companions.includes('PARENTS'),
        childFriendly: Array.isArray(partial.companions) && partial.companions.includes('CHILDREN'),
      },
      loadLimits: {
        maxPhysicalEffort:
          Array.isArray(partial.constraints) && partial.constraints.includes('LOW_PHYSICAL_LOAD') ? 2 : undefined,
      },
      contextualConstraints: {
        dateRange: draftDto.startDate && draftDto.endDate ? [draftDto.startDate, draftDto.endDate] : undefined,
        vehicleType: typeof partial.vehicleType === 'string' ? partial.vehicleType : undefined,
      },
    };
  }

  private extractExperienceAtoms(rawUserIntent: string, partial: Record<string, any>): string[] {
    const atoms = new Set<string>();
    const text = rawUserIntent.toLowerCase();
    const pushIf = (condition: boolean, atom: string) => {
      if (condition) atoms.add(atom);
    };

    pushIf(/自然|雪山|冰川|瀑布|湖|森林|nature|glacier|waterfall|lake/.test(text), 'nature');
    pushIf(/美食|吃|餐厅|料理|food|restaurant/.test(text), 'food');
    pushIf(/文化|历史|博物馆|寺|神社|culture|museum|temple|shrine/.test(text), 'culture');
    pushIf(/亲子|孩子|小孩|family|kid/.test(text), 'family_friendly');
    pushIf(/轻松|松弛|休闲|relax/.test(text), 'relaxed');
    pushIf(/徒步|hiking|trail/.test(text), 'hiking');
    pushIf(/拍照|摄影|photo|photography/.test(text), 'photography');
    pushIf(/购物|shop|shopping/.test(text), 'shopping');

    const mustHaveExperiences = Array.isArray(partial.mustHaveExperiences) ? partial.mustHaveExperiences : [];
    for (const value of mustHaveExperiences) {
      if (typeof value === 'string' && value.trim()) atoms.add(value.trim());
    }
    return [...atoms];
  }

  private resolvePreferredPoiTypes(draftDto: CreateTripDraftDto, atoms: string[]): string[] {
    const types = new Set<string>();
    if (draftDto.style) types.add(String(draftDto.style));
    for (const atom of atoms) types.add(atom);
    if (types.size === 0) {
      types.add('attraction');
      types.add('restaurant');
    }
    return [...types];
  }

  private async persistCandidateSnapshot(
    tripId: string,
    poiIntent: PoiQueryIntent,
    experienceCandidates: ExperienceCandidate[],
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const metadata = ((trip.metadata as Record<string, any>) || {}) as Record<string, any>;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          poiCandidateRetrieval: {
            queryIntent: poiIntent,
            candidateCount: experienceCandidates.length,
            candidates: experienceCandidates.slice(0, 30),
            updatedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      },
    });
  }

  private async persistTemplateSnapshot(tripId: string, matchedTemplates: MatchedRouteTemplate[]): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const metadata = ((trip.metadata as Record<string, any>) || {}) as Record<string, any>;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          routeTemplateRetrieval: {
            templateCount: matchedTemplates.length,
            templates: matchedTemplates.map((template) => ({
              templateId: template.templateId,
              routeDirectionId: template.routeDirectionId,
              name: template.name,
              durationDays: template.durationDays,
              score: template.score,
              matchedReasons: template.matchedReasons,
              poiRefs: template.poiRefs.slice(0, 30),
            })),
            updatedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      },
    });
  }

  private async markRepairRequired(
    tripId: string,
    poiIntent: PoiQueryIntent,
    experienceCandidates: ExperienceCandidate[],
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const metadata = ((trip.metadata as Record<string, any>) || {}) as Record<string, any>;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          generatingItems: false,
          feasibilityStatus: 'REPAIR_REQUIRED',
          lifecycleStatus: metadata.lifecycleStatus || 'STRATEGY_DRAFTED',
          planningStages: {
            ...(metadata.planningStages || {}),
            strategyGenerated: true,
            itineraryGenerated: false,
            feasibilityChecked: true,
          },
          generationProgress: {
            status: 'failed',
            stage: 'candidate_repair_required',
            message: `POI 候选不足（${experienceCandidates.length} 个）。需要扩大目的地范围、补充城市/区域，或先导入该目的地 POI 数据。`,
            updatedAt: new Date().toISOString(),
          },
          repairContract: {
            violation: 'INSUFFICIENT_POI_CANDIDATES',
            preserveGoals: poiIntent.requiredExperienceAtoms.map((x) => x.atom),
            replacementSearchSpace: {
              countryCode: poiIntent.destinationScope.countryCode,
              excludedPoiIds: experienceCandidates.map((candidate) => candidate.poiId).filter(Boolean),
            },
            nextActions: ['ASK_FOR_CITY_OR_REGION', 'EXPAND_SEARCH_SCOPE', 'IMPORT_DESTINATION_POI_DATA'],
          },
        } as any,
        updatedAt: new Date(),
      },
    });
  }

  private async resolveCandidatePoiNames(candidates: ExperienceCandidate[]): Promise<string[]> {
    const ids = candidates
      .map((candidate) => Number(candidate.poiId))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return [];
    const places = await this.prisma.place.findMany({
      where: { id: { in: ids } },
      select: { nameCN: true, nameEN: true },
    });
    return places
      .map((place) => place.nameCN || place.nameEN)
      .filter((name): name is string => Boolean(name && name.trim()));
  }

  private async resolveTemplatePoiNames(templates: MatchedRouteTemplate[]): Promise<string[]> {
    const refs = templates.flatMap((template) => template.poiRefs);
    if (refs.length === 0) return [];

    const names = new Set<string>();
    for (const ref of refs) {
      if (ref.nameCN?.trim()) names.add(ref.nameCN.trim());
      if (ref.nameEN?.trim()) names.add(ref.nameEN.trim());
    }

    const ids = refs.map((ref) => ref.id).filter((id): id is number => Number.isInteger(id) && id > 0);
    const uuids = refs.map((ref) => ref.uuid).filter((uuid): uuid is string => Boolean(uuid?.trim()));
    if (ids.length > 0 || uuids.length > 0) {
      const places = await this.prisma.place.findMany({
        where: {
          OR: [
            ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
            ...(uuids.length > 0 ? [{ uuid: { in: uuids } }] : []),
          ],
        },
        select: { nameCN: true, nameEN: true },
      });
      for (const place of places) {
        if (place.nameCN?.trim()) names.add(place.nameCN.trim());
        if (place.nameEN?.trim()) names.add(place.nameEN.trim());
      }
    }

    return [...names].slice(0, 20);
  }

  private mergeMustHavePoiNames(existing: string[] | undefined, names: string[]): string[] {
    const merged = new Set<string>();
    for (const item of existing ?? []) {
      if (item?.trim()) merged.add(item.trim());
    }
    for (const name of names) {
      if (name.trim()) merged.add(name.trim());
    }
    return [...merged].slice(0, 16);
  }

  private async markGenerationComplete(tripId: string, itemsCount: number): Promise<void> {
    await this.updateGenerationProgress(tripId, {
      status: 'completed',
      stage: 'completed',
      message: `成功生成 ${itemsCount} 个行程项`,
      itemsCount,
    });
  }
}
