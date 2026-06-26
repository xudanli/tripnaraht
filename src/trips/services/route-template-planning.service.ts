import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PoiQueryIntent } from '../types/poi-intent-contract.types';

export type MatchedRouteTemplate = {
  templateId: number;
  routeDirectionId: number;
  name: string;
  durationDays: number;
  score: number;
  matchedReasons: string[];
  poiRefs: Array<{
    id?: number;
    uuid?: string;
    nameCN?: string;
    nameEN?: string;
    day?: number;
    role?: string;
    required?: boolean;
  }>;
};

@Injectable()
export class RouteTemplatePlanningService {
  constructor(private readonly prisma: PrismaService) {}

  async findBestTemplates(intent: PoiQueryIntent, durationDays?: number, limit = 3): Promise<MatchedRouteTemplate[]> {
    const countryCode = intent.destinationScope.countryCode?.toUpperCase().trim();
    if (!countryCode) return [];

    const templates = await this.prisma.routeTemplate.findMany({
      where: {
        isActive: true,
        routeDirection: {
          countryCode,
          isActive: true,
          status: { in: ['active', 'published', 'ACTIVE', 'PUBLISHED'] },
        },
        ...(durationDays ? { durationDays: { gte: Math.max(1, durationDays - 2), lte: durationDays + 2 } } : {}),
      },
      include: { routeDirection: true },
      take: 30,
      orderBy: [{ durationDays: 'asc' }, { updatedAt: 'desc' }],
    });

    return templates
      .map((template) => {
        const matchedReasons: string[] = [];
        let score = 0;

        if (durationDays) {
          const dayDiff = Math.abs(template.durationDays - durationDays);
          score += Math.max(0, 4 - dayDiff);
          matchedReasons.push(dayDiff === 0 ? 'duration_exact' : `duration_near_${dayDiff}`);
        }

        const text = [
          template.name,
          template.nameCN,
          template.nameEN,
          template.defaultPacePreference,
          ...(template.routeDirection.tags || []),
          JSON.stringify(template.metadata || {}),
          JSON.stringify(template.routeDirection.metadata || {}),
          JSON.stringify(template.routeDirection.signaturePois || {}),
          JSON.stringify(template.dayPlans || {}),
        ].join(' ').toLowerCase();

        for (const atom of intent.requiredExperienceAtoms) {
          if (text.includes(atom.atom.toLowerCase())) {
            score += Math.max(0.5, atom.weight);
            matchedReasons.push(`atom:${atom.atom}`);
          }
        }
        for (const type of intent.preferredPoiTypes) {
          if (text.includes(type.toLowerCase())) {
            score += 0.5;
            matchedReasons.push(`type:${type}`);
          }
        }

        const pace = this.resolvePace(intent);
        if (pace && template.defaultPacePreference?.toUpperCase() === pace) {
          score += 1;
          matchedReasons.push(`pace:${pace}`);
        }

        const poiRefs = this.extractPoiRefs(template.dayPlans);
        score += Math.min(2, poiRefs.length / 6);
        if (poiRefs.length > 0) matchedReasons.push(`template_pois:${poiRefs.length}`);

        return {
          templateId: template.id,
          routeDirectionId: template.routeDirectionId,
          name: template.nameCN || template.name || template.nameEN || `RouteTemplate ${template.id}`,
          durationDays: template.durationDays,
          score,
          matchedReasons: [...new Set(matchedReasons)],
          poiRefs,
        };
      })
      .filter((template) => template.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private resolvePace(intent: PoiQueryIntent): string | undefined {
    const hasRelaxed =
      intent.requiredExperienceAtoms.some((atom) => atom.atom === 'relaxed') ||
      intent.loadLimits.maxPhysicalEffort != null;
    if (hasRelaxed) return 'RELAXED';
    return undefined;
  }

  private extractPoiRefs(dayPlans: unknown): MatchedRouteTemplate['poiRefs'] {
    if (!Array.isArray(dayPlans)) return [];
    const refs: MatchedRouteTemplate['poiRefs'] = [];
    for (const plan of dayPlans) {
      const p = plan as Record<string, any>;
      const day = typeof p.day === 'number' ? p.day : undefined;
      const pois = Array.isArray(p.pois) ? p.pois : [];
      for (const poi of pois) {
        if (!poi || typeof poi !== 'object') continue;
        refs.push({
          id: typeof poi.id === 'number' ? poi.id : undefined,
          uuid: typeof poi.uuid === 'string' ? poi.uuid : undefined,
          nameCN: typeof poi.nameCN === 'string' ? poi.nameCN : undefined,
          nameEN: typeof poi.nameEN === 'string' ? poi.nameEN : undefined,
          day,
          role: typeof poi.role === 'string' ? poi.role : typeof poi.slot === 'string' ? poi.slot : undefined,
          required: poi.required === true || poi.priority === 'MUST_SEE',
        });
      }
    }
    return refs;
  }
}
