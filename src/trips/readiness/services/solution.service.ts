// src/trips/readiness/services/solution.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetSolutionsResponseDto, SolutionDto } from '../dto/solution.dto';

@Injectable()
export class SolutionService {
  private readonly logger = new Logger(SolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取阻塞项修复方案
   */
  async getSolutions(
    tripId: string,
    blockerId: string,
  ): Promise<GetSolutionsResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 根据阻塞项ID生成解决方案
    // 这里是一个简化的实现，实际应该根据阻塞项的类型和内容生成更智能的解决方案
    const solutions: SolutionDto[] = this.generateSolutionsForBlocker(blockerId, trip);

    // 获取阻塞项消息（这里简化处理，实际应该从准备度检查结果中获取）
    const blockerMessage = this.getBlockerMessage(blockerId);

    return {
      blockerId,
      blockerMessage,
      solutions,
    };
  }

  /**
   * 根据阻塞项ID生成解决方案
   */
  private generateSolutionsForBlocker(
    blockerId: string,
    _trip: any,
  ): SolutionDto[] {
    const solutions: SolutionDto[] = [];

    // 根据阻塞项ID的模式匹配生成解决方案
    if (blockerId.includes('4x4') || blockerId.includes('vehicle')) {
      solutions.push({
        id: 'sol-1',
        title: '替换为铺装路面路线',
        description: '将 F 段改为使用铺装路面，绕行距离增加 15km',
        type: 'alternative',
        changes: {
          distance: '+15km',
          time: '+25min',
          risk: 'decrease',
        },
        reasonCode: 'ALTERNATIVE_ROUTE',
        autoApplicable: true,
        preview: {
          affectedItems: ['segment-f-1', 'segment-f-2'],
        },
      });

      solutions.push({
        id: 'sol-2',
        title: '手动预订 4x4 车辆',
        description: '在租车平台预订 4x4 车辆，预计费用 ¥800/天',
        type: 'manual',
        changes: {
          cost: '+¥800',
          risk: 'same',
        },
        autoApplicable: false,
      });
    } else if (blockerId.includes('visa') || blockerId.includes('签证')) {
      solutions.push({
        id: 'sol-1',
        title: '申请签证',
        description: '访问大使馆官网申请签证，准备所需材料',
        type: 'manual',
        changes: {
          cost: '+¥500',
          time: '+7days',
          risk: 'same',
        },
        reasonCode: 'VISA_APPLICATION',
        evidenceLink: 'https://example.com/visa-info',
        autoApplicable: false,
      });
    } else {
      // 默认解决方案
      solutions.push({
        id: 'sol-1',
        title: '手动处理',
        description: '请根据具体情况手动处理此阻塞项',
        type: 'manual',
        autoApplicable: false,
      });
    }

    return solutions;
  }

  /**
   * 获取阻塞项消息
   */
  private getBlockerMessage(blockerId: string): string {
    // 这里简化处理，实际应该从准备度检查结果中获取
    if (blockerId.includes('4x4') || blockerId.includes('vehicle')) {
      return 'F - 公路段需租赁 4x4 车辆';
    }
    if (blockerId.includes('visa') || blockerId.includes('签证')) {
      return '需要办理签证';
    }
    return '阻塞项：需要处理';
  }
}

