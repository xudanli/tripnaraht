// src/trips/services/trip-emergency.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface EmergencySOSRequest {
  tripId: string;
  latitude: number;
  longitude: number;
  message?: string;
  timestamp?: Date;
}

export interface EmergencySOSResponse {
  sosId: string;
  tripId: string;
  status: 'SENT' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
  coordinates: {
    latitude: number;
    longitude: number;
  };
  sentAt: Date;
  rescueInfo?: {
    estimatedArrival?: string;
    contactNumber?: string;
    progress?: string;
  };
}

@Injectable()
export class TripEmergencyService {
  private readonly logger = new Logger(TripEmergencyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 发送紧急求救信号
   * 
   * @param request 求救请求
   * @returns 求救响应
   */
  async sendSOS(request: EmergencySOSRequest): Promise<EmergencySOSResponse> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: request.tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${request.tripId} 不存在`);
    }

    // 生成求救信息
    const sosId = randomUUID();
    const sentAt = request.timestamp || new Date();

    // 构建求救信息（包含行程背景）
    const tripContext = {
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      currentDate: sentAt,
      itinerary: trip.TripDay.flatMap(day => 
        day.ItineraryItem.map(item => ({
          date: day.date,
          place: item.Place ? {
            name: item.Place.nameCN || item.Place.nameEN,
            address: item.Place.address,
            coordinates: undefined, // Place 没有 location 属性，需要从其他地方获取
          } : null,
        }))
      ),
    };

    // TODO: 实际集成卫星求救服务
    // 这里模拟发送到救援联盟
    this.logger.log(`发送紧急求救信号: SOS ID=${sosId}, Trip ID=${request.tripId}, 坐标=(${request.latitude}, ${request.longitude})`);

    // 保存求救记录到 metadata
    const emergencyRecord = {
      sosId,
      coordinates: {
        latitude: request.latitude,
        longitude: request.longitude,
      },
      message: request.message,
      sentAt: sentAt.toISOString(),
      status: 'SENT',
      tripContext,
    };

    // 更新行程 metadata
    const currentMetadata = (trip.metadata as any) || {};
    const emergencyHistory = currentMetadata.emergencyHistory || [];
    emergencyHistory.push(emergencyRecord);

    await this.prisma.trip.update({
      where: { id: request.tripId },
      data: {
        metadata: {
          ...currentMetadata,
          emergencyHistory,
          lastEmergencySOS: emergencyRecord,
        },
      },
    });

    return {
      sosId,
      tripId: request.tripId,
      status: 'SENT',
      coordinates: {
        latitude: request.latitude,
        longitude: request.longitude,
      },
      sentAt,
    };
  }

  /**
   * 获取求救记录
   * 
   * @param tripId 行程 ID
   * @returns 求救记录列表
   */
  async getSOSHistory(tripId: string): Promise<EmergencySOSResponse[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const metadata = (trip.metadata as any) || {};
    const emergencyHistory = metadata.emergencyHistory || [];

    return emergencyHistory.map((record: any) => ({
      sosId: record.sosId,
      tripId,
      status: record.status || 'SENT',
      coordinates: record.coordinates,
      sentAt: new Date(record.sentAt),
      rescueInfo: record.rescueInfo,
    }));
  }

  /**
   * 更新救援进度
   * 
   * @param sosId 求救 ID
   * @param progress 救援进度信息
   */
  async updateRescueProgress(
    sosId: string,
    progress: {
      status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
      estimatedArrival?: string;
      contactNumber?: string;
      progress?: string;
    }
  ): Promise<void> {
    // 查找包含该 SOS ID 的行程
    const trips = await this.prisma.trip.findMany({
      where: {
        metadata: {
          path: ['lastEmergencySOS', 'sosId'],
          equals: sosId,
        },
      },
    });

    if (trips.length === 0) {
      throw new NotFoundException(`未找到 SOS ID ${sosId} 对应的行程`);
    }

    const trip = trips[0];
    const metadata = (trip.metadata as any) || {};
    const emergencyHistory = metadata.emergencyHistory || [];

    // 更新对应的求救记录
    const updatedHistory = emergencyHistory.map((record: any) => {
      if (record.sosId === sosId) {
        return {
          ...record,
          status: progress.status,
          rescueInfo: {
            estimatedArrival: progress.estimatedArrival,
            contactNumber: progress.contactNumber,
            progress: progress.progress,
          },
        };
      }
      return record;
    });

    // 更新 lastEmergencySOS
    const lastEmergency = updatedHistory[updatedHistory.length - 1];
    if (lastEmergency && lastEmergency.sosId === sosId) {
      metadata.lastEmergencySOS = {
        ...lastEmergency,
        status: progress.status,
        rescueInfo: {
          estimatedArrival: progress.estimatedArrival,
          contactNumber: progress.contactNumber,
          progress: progress.progress,
        },
      };
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        metadata: {
          ...metadata,
          emergencyHistory: updatedHistory,
          lastEmergencySOS: metadata.lastEmergencySOS,
        },
      },
    });

    this.logger.log(`更新救援进度: SOS ID=${sosId}, Status=${progress.status}`);
  }
}

