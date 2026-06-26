import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateTripWishDto,
  CreateWishFromInspirationDto,
  UpdateTripWishDto,
} from '../dto/trip-wish.dto';
import { TripWishAccessService } from './trip-wish-access.service';
import { TripWishStructuringService } from './trip-wish-structuring.service';
import { TripWishSuggestionService } from './trip-wish-suggestion.service';
import type {
  TeamWishViewItem,
  TripWishItemRecord,
  WishAgentSnapshot,
  WishCategory,
} from '../types/trip-wish.types';
import { mapTripWishRow } from '../utils/trip-wish.mapper.util';
import { buildWishAgentSnapshot } from '../utils/wish-agent-snapshot.util';
import { wishCategoryLabel } from '../utils/wish-category.util';
import { clampImportance } from '../utils/wish-category.util';
import {
  computeDayWishImpact,
  type DayWishImpact,
  type TripDayContext,
} from '../utils/wish-day-impact.util';
import {
  getIcelandInspirationAsset,
  listIcelandInspirationAssets,
} from '../data/iceland-inspiration.assets';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';

@Injectable()
export class TripWishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripWishAccessService,
    private readonly structuring: TripWishStructuringService,
    private readonly suggestions: TripWishSuggestionService,
  ) {}

  async listMine(tripId: string, userId: string): Promise<TripWishItemRecord[]> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripWishItem.findMany({
      where: { tripId, userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapTripWishRow);
  }

  async listTeam(tripId: string, userId: string): Promise<TeamWishViewItem[]> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripWishItem.findMany({
      where: {
        tripId,
        status: 'active',
        visibility: { in: ['anonymous', 'signed'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const userNames = await this.resolveDisplayNames(
      rows.filter((r) => r.visibility === 'signed').map((r) => r.userId),
    );
    return rows.map((row) => {
      const item = mapTripWishRow(row);
      return {
        id: item.id,
        category: item.category,
        categoryLabel: wishCategoryLabel(item.category),
        text: item.text,
        importance: item.importance,
        visibility: item.visibility as 'anonymous' | 'signed',
        authorDisplayName:
          item.visibility === 'signed' ? userNames.get(item.userId) : undefined,
        createdAt: item.createdAt,
      };
    });
  }

  async create(
    tripId: string,
    userId: string,
    dto: CreateTripWishDto,
  ): Promise<TripWishItemRecord> {
    await this.access.assertTripMember(tripId, userId);
    const structuredHints =
      dto.structuredHints ??
      this.structuring.inferStructuredHints(dto.text, dto.category);

    const row = await this.prisma.tripWishItem.create({
      data: {
        tripId,
        userId,
        category: dto.category,
        text: dto.text,
        importance: clampImportance(dto.importance ?? 3),
        inputMode: dto.inputMode,
        sourceRef: dto.sourceRef ? toInputJsonValue(dto.sourceRef) : undefined,
        visibility: dto.visibility ?? 'private',
        agentEligible: dto.agentEligible ?? true,
        structuredHints: toInputJsonValue(structuredHints),
      },
    });
    return mapTripWishRow(row);
  }

  async createFromCard(
    tripId: string,
    userId: string,
    cardId: string,
    overrides?: Partial<Pick<CreateTripWishDto, 'text' | 'importance' | 'visibility'>>,
  ): Promise<TripWishItemRecord> {
    const card = this.suggestions.findCardById(cardId);
    if (!card) {
      throw new NotFoundException(`推荐卡片 ${cardId} 不存在`);
    }
    return this.create(tripId, userId, {
      category: card.category,
      text: overrides?.text ?? card.defaultText,
      importance: overrides?.importance ?? card.defaultImportance,
      inputMode: 'card_select',
      visibility: overrides?.visibility ?? 'private',
      sourceRef: { cardId },
      structuredHints: card.structuredHints,
    });
  }

  async createFromInspiration(
    tripId: string,
    userId: string,
    dto: CreateWishFromInspirationDto,
  ): Promise<TripWishItemRecord> {
    const asset = getIcelandInspirationAsset(dto.inspirationAssetId);
    if (!asset) {
      throw new NotFoundException(`灵感素材 ${dto.inspirationAssetId} 不存在`);
    }
    const text = dto.textOverride ?? `想去看看：${asset.caption}`;
    const category: WishCategory = asset.tags.includes('food')
      ? 'dining'
      : asset.tags.includes('hot_spring') || asset.tags.includes('aurora')
        ? 'activities'
        : 'activities';

    return this.create(tripId, userId, {
      category,
      text,
      importance: dto.importance ?? 4,
      inputMode: 'inspiration',
      visibility: dto.visibility ?? 'private',
      sourceRef: { inspirationAssetId: asset.id },
      structuredHints: {
        must_do: asset.relatedPoiIds,
        tags: asset.tags,
      },
    });
  }

  async update(
    tripId: string,
    wishId: string,
    userId: string,
    dto: UpdateTripWishDto,
  ): Promise<TripWishItemRecord> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireOwnedWish(tripId, wishId, userId);

    const category = dto.category ?? existing.category;
    const text = dto.text ?? existing.text;
    const structuredHints =
      dto.text !== undefined || dto.category !== undefined
        ? this.structuring.inferStructuredHints(text, category)
        : existing.structuredHints;

    const row = await this.prisma.tripWishItem.update({
      where: { id: wishId },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
        ...(dto.importance !== undefined
          ? { importance: clampImportance(dto.importance) }
          : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
        ...(dto.agentEligible !== undefined ? { agentEligible: dto.agentEligible } : {}),
        ...(structuredHints !== undefined
          ? { structuredHints: toInputJsonValue(structuredHints) }
          : {}),
      },
    });
    return mapTripWishRow(row);
  }

  async archive(tripId: string, wishId: string, userId: string): Promise<void> {
    await this.access.assertTripMember(tripId, userId);
    await this.requireOwnedWish(tripId, wishId, userId);
    await this.prisma.tripWishItem.update({
      where: { id: wishId },
      data: { status: 'archived' },
    });
  }

  async getAgentSnapshot(tripId: string, userId: string): Promise<WishAgentSnapshot> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripWishItem.findMany({
      where: { tripId, userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return buildWishAgentSnapshot(tripId, userId, rows.map(mapTripWishRow));
  }

  async getWishSummary(tripId: string, userId: string) {
    await this.access.assertTripMember(tripId, userId);
    const [mine, teamCount, dayImpact] = await Promise.all([
      this.listMine(tripId, userId),
      this.prisma.tripWishItem.count({
        where: {
          tripId,
          status: 'active',
          visibility: { in: ['anonymous', 'signed'] },
        },
      }),
      this.getDayImpact(tripId, userId),
    ]);

    return {
      privateCount: mine.filter((w) => w.visibility === 'private').length,
      mineCount: mine.length,
      teamCount,
      agentEligibleCount: mine.filter((w) => w.agentEligible).length,
      impactByDay: dayImpact,
    };
  }

  async getDayImpact(tripId: string, userId: string): Promise<DayWishImpact[]> {
    await this.access.assertTripMember(tripId, userId);
    const [wishes, days] = await Promise.all([
      this.listMine(tripId, userId),
      this.loadTripDayContexts(tripId),
    ]);
    return computeDayWishImpact(wishes, days);
  }

  getSuggestionCards(category?: WishCategory, destination?: string) {
    return this.suggestions.getSuggestedCards(category, destination);
  }

  listInspiration(filters?: { region?: string; tag?: string; offset?: number; limit?: number }) {
    return listIcelandInspirationAssets(filters);
  }

  async loadItemsForContext(args: {
    tripId: string;
    userId?: string;
    includePrivate: boolean;
  }): Promise<{ userItems: TripWishItemRecord[]; teamItems: TripWishItemRecord[] }> {
    const rows = await this.prisma.tripWishItem.findMany({
      where: { tripId: args.tripId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    const all = rows.map(mapTripWishRow);
    const userItems = args.userId
      ? all.filter((i) => i.userId === args.userId)
      : [];
    const teamItems = all.filter((i) => i.visibility !== 'private');
    return { userItems, teamItems };
  }

  private async requireOwnedWish(tripId: string, wishId: string, userId: string) {
    const row = await this.prisma.tripWishItem.findFirst({
      where: { id: wishId, tripId, userId, status: 'active' },
    });
    if (!row) {
      throw new NotFoundException(`愿望 ${wishId} 不存在或无权修改`);
    }
    return mapTripWishRow(row);
  }

  private async loadTripDayContexts(tripId: string): Promise<TripDayContext[]> {
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      include: {
        ItineraryItem: {
          include: { Place: { select: { nameCN: true, nameEN: true, id: true } } },
        },
      },
    });

    return tripDays.map((day, index) => {
      const parts: string[] = [];
      const poiIds: string[] = [];
      for (const item of day.ItineraryItem) {
        if (item.note) parts.push(item.note);
        if (item.Place?.nameCN) parts.push(item.Place.nameCN);
        if (item.Place?.nameEN) parts.push(item.Place.nameEN);
        if (item.placeId != null) poiIds.push(String(item.placeId));
      }
      return {
        dayIndex: index + 1,
        date: day.date.toISOString().slice(0, 10),
        textBlob: parts.join(' ').toLowerCase(),
        poiIds,
      };
    });
  }

  private async resolveDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const unique = [...new Set(userIds.filter((id) => uuidPattern.test(id)))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true, email: true },
    });
    for (const u of users) {
      map.set(u.id, u.displayName ?? u.email ?? '同行者');
    }
    return map;
  }
}
