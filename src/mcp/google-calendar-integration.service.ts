/**
 * Google Calendar Integration Service
 * 
 * 封装行程同步到 Google Calendar 的逻辑
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from './google-calendar.service';
import { RedisService } from '../redis/redis.service';

export interface SyncTripResult {
  success: boolean;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: Array<{ itemId: string; error: string }>;
}

export interface CalendarEventMapping {
  tripId: string;
  itineraryItemId: string;
  calendarId: string;
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class GoogleCalendarIntegrationService {
  private readonly logger = new Logger(GoogleCalendarIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    if (!googleCalendarService) {
      this.logger.warn('GoogleCalendarService not available, Google Calendar integration will be disabled');
    }
  }

  /**
   * 将行程同步到 Google Calendar
   * 
   * @param tripId 行程 ID
   * @param userId 用户 ID（用于权限检查）
   * @param calendarId 目标日历 ID（可选，默认使用主日历）
   */
  async syncTripToCalendar(
    tripId: string,
    userId: string,
    calendarId?: string,
  ): Promise<SyncTripResult> {
    if (!this.googleCalendarService) {
      this.logger.warn('GoogleCalendarService not available, skipping sync');
      return {
        success: false,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [{ itemId: tripId, error: 'GoogleCalendarService not available' }],
      };
    }

    try {
      // 获取行程详情
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            orderBy: { date: 'asc' },
            include: {
              ItineraryItem: {
                orderBy: { startTime: 'asc' },
                include: {
                  Place: {
                    select: {
                      id: true,
                      nameCN: true,
                      nameEN: true,
                      category: true,
                      address: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!trip) {
        throw new Error(`Trip ${tripId} not found`);
      }

      // 获取或选择日历
      let targetCalendarId = calendarId;
      if (!targetCalendarId) {
        const calendars = await this.googleCalendarService.listCalendars();
        const primaryCalendar = calendars.calendars?.find((cal: any) => cal.primary) || calendars.calendars?.[0];
        targetCalendarId = primaryCalendar?.id || 'primary';
      }

      const result: SyncTripResult = {
        success: true,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [],
      };

      // 获取现有的映射关系
      const existingMappings = await this.getEventMappings(tripId);

      // 为每个行程项创建或更新日历事件
      for (const day of trip.TripDay) {
        for (const item of day.ItineraryItem) {
          try {
            // 检查是否已有映射
            const existingMapping = existingMappings.find(m => m.itineraryItemId === item.id);

            if (existingMapping) {
              // 更新现有事件
              await this.googleCalendarService.updateEvent({
                calendarId: existingMapping.calendarId,
                eventId: existingMapping.eventId,
                summary: this.getEventSummary(item, trip),
                start: item.startTime ? {
                  dateTime: item.startTime.toISOString(),
                } : {
                  date: day.date.toISOString().split('T')[0],
                },
                end: item.endTime ? {
                  dateTime: item.endTime.toISOString(),
                } : {
                  date: day.date.toISOString().split('T')[0],
                },
                description: this.getEventDescription(item, trip),
                location: item.Place?.address || undefined,
              });

              // 更新映射的更新时间
              await this.updateEventMapping(tripId, item.id, existingMapping.calendarId, existingMapping.eventId);
              result.eventsUpdated++;
            } else {
              // 创建新事件
              const event = await this.googleCalendarService.createEvent({
                calendarId: targetCalendarId,
                summary: this.getEventSummary(item, trip),
                start: item.startTime ? {
                  dateTime: item.startTime.toISOString(),
                } : {
                  date: day.date.toISOString().split('T')[0],
                },
                end: item.endTime ? {
                  dateTime: item.endTime.toISOString(),
                } : {
                  date: day.date.toISOString().split('T')[0],
                },
                description: this.getEventDescription(item, trip),
                location: item.Place?.address || undefined,
              });

              // 保存映射关系
              const eventId = event.id || event.eventId || event.event?.id;
              if (eventId != null && eventId !== '') {
                await this.saveEventMapping(tripId, item.id, targetCalendarId ?? 'primary', String(eventId));
                result.eventsCreated++;
              } else {
                this.logger.warn(`Failed to get event ID for item ${item.id}`);
                result.errors.push({ itemId: item.id, error: 'Failed to get event ID' });
              }
            }
          } catch (error: any) {
            this.logger.error(`Failed to sync item ${item.id}:`, error);
            result.errors.push({ itemId: item.id, error: error.message });
            result.success = false;
          }
        }
      }

      // 删除不再存在的行程项对应的日历事件
      const currentItemIds = new Set(
        trip.TripDay.flatMap(day => day.ItineraryItem.map(item => item.id))
      );
      const mappingsToDelete = existingMappings.filter(m => !currentItemIds.has(m.itineraryItemId));

      for (const mapping of mappingsToDelete) {
        try {
          await this.googleCalendarService.deleteEvent({
            calendarId: mapping.calendarId,
            eventId: mapping.eventId,
          });
          await this.deleteEventMapping(tripId, mapping.itineraryItemId);
          result.eventsDeleted++;
        } catch (error: any) {
          this.logger.error(`Failed to delete event ${mapping.eventId}:`, error);
          result.errors.push({ itemId: mapping.itineraryItemId, error: error.message });
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to sync trip ${tripId}:`, error);
      return {
        success: false,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [{ itemId: tripId, error: error.message }],
      };
    }
  }

  /**
   * 删除行程的所有日历事件
   */
  async deleteTripEvents(tripId: string): Promise<SyncTripResult> {
    if (!this.googleCalendarService) {
      this.logger.warn('GoogleCalendarService not available, skipping delete');
      return {
        success: false,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [{ itemId: tripId, error: 'GoogleCalendarService not available' }],
      };
    }

    try {
      const mappings = await this.getEventMappings(tripId);
      const result: SyncTripResult = {
        success: true,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [],
      };

      for (const mapping of mappings) {
        try {
          await this.googleCalendarService.deleteEvent({
            calendarId: mapping.calendarId,
            eventId: mapping.eventId,
          });
          await this.deleteEventMapping(tripId, mapping.itineraryItemId);
          result.eventsDeleted++;
        } catch (error: any) {
          this.logger.error(`Failed to delete event ${mapping.eventId}:`, error);
          result.errors.push({ itemId: mapping.itineraryItemId, error: error.message });
          result.success = false;
        }
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to delete trip events ${tripId}:`, error);
      return {
        success: false,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [{ itemId: tripId, error: error.message }],
      };
    }
  }

  /**
   * 检查用户可用时间
   */
  async checkUserAvailability(
    timeMin: string,
    timeMax: string,
    durationMinutes: number = 60,
    calendarId?: string,
  ): Promise<any> {
    if (!this.googleCalendarService) {
      this.logger.warn('GoogleCalendarService not available, skipping availability check');
      return { freeSlots: [] };
    }

    try {
      return await this.googleCalendarService.findFreeSlots({
        calendarId,
        timeMin,
        timeMax,
        durationMinutes,
      });
    } catch (error: any) {
      this.logger.error('Failed to check availability:', error);
      return { freeSlots: [], error: error.message };
    }
  }

  /**
   * 获取事件摘要（标题）
   */
  private getEventSummary(item: any, trip: any): string {
    const placeName = item.Place?.nameCN || item.Place?.nameEN || '行程项';
    const tripName = trip.name ? ` - ${trip.name}` : '';
    return `${placeName}${tripName}`;
  }

  /**
   * 获取事件描述
   */
  private getEventDescription(item: any, trip: any): string {
    const parts: string[] = [];

    if (trip.name) {
      parts.push(`行程: ${trip.name}`);
    }

    if (item.Place) {
      const placeName = item.Place.nameCN || item.Place.nameEN;
      parts.push(`地点: ${placeName}`);
      
      if (item.Place.description) {
        parts.push(`\n${item.Place.description}`);
      }
    }

    if (item.note) {
      parts.push(`备注: ${item.note}`);
    }

    parts.push(`\n来源: TripNara`);

    return parts.join('\n');
  }

  /**
   * 获取事件映射关系（从数据库或缓存）
   */
  private async getEventMappings(tripId: string): Promise<CalendarEventMapping[]> {
    // TODO: 实际应用中需要创建数据库表存储映射关系
    // 这里先使用 Redis 作为临时存储
    if (this.redisService) {
      try {
        const key = `google-calendar:mapping:${tripId}`;
        const cached = await this.redisService.get(key);
        if (cached) {
          return JSON.parse(cached as string);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached mappings:', error);
      }
    }

    return [];
  }

  /**
   * 保存事件映射关系
   */
  private async saveEventMapping(
    tripId: string,
    itineraryItemId: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    // TODO: 实际应用中需要保存到数据库
    // 这里先使用 Redis 作为临时存储
    if (this.redisService) {
      try {
        const key = `google-calendar:mapping:${tripId}`;
        const mappings = await this.getEventMappings(tripId);
        mappings.push({
          tripId,
          itineraryItemId,
          calendarId,
          eventId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await this.redisService.set(key, JSON.stringify(mappings), 86400 * 365); // 保存 1 年
      } catch (error) {
        this.logger.warn('Failed to save mapping:', error);
      }
    }
  }

  /**
   * 更新事件映射关系
   */
  private async updateEventMapping(
    tripId: string,
    itineraryItemId: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    if (this.redisService) {
      try {
        const key = `google-calendar:mapping:${tripId}`;
        const mappings = await this.getEventMappings(tripId);
        const index = mappings.findIndex(m => m.itineraryItemId === itineraryItemId);
        if (index >= 0) {
          mappings[index] = {
            ...mappings[index],
            calendarId,
            eventId,
            updatedAt: new Date(),
          };
          await this.redisService.set(key, JSON.stringify(mappings), 86400 * 365);
        }
      } catch (error) {
        this.logger.warn('Failed to update mapping:', error);
      }
    }
  }

  /**
   * 删除事件映射关系
   */
  private async deleteEventMapping(tripId: string, itineraryItemId: string): Promise<void> {
    if (this.redisService) {
      try {
        const key = `google-calendar:mapping:${tripId}`;
        const mappings = await this.getEventMappings(tripId);
        const filtered = mappings.filter(m => m.itineraryItemId !== itineraryItemId);
        await this.redisService.set(key, JSON.stringify(filtered), 86400 * 365);
      } catch (error) {
        this.logger.warn('Failed to delete mapping:', error);
      }
    }
  }
}
