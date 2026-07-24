import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RouteDirectionsService } from '../route-directions/route-directions.service';
import { MatchSquareService } from './match-square.service';
import { resolveCatalogEntryForRouteTemplate } from './engine/route-template-launch-recruitment.engine';
import type {
  LaunchRecruitmentFromTemplateInput,
  LaunchRecruitmentFromTemplateResultView,
} from './types/route-template-launch-recruitment.types';

@Injectable()
export class RouteTemplateLaunchRecruitmentService {
  private readonly logger = new Logger(RouteTemplateLaunchRecruitmentService.name);

  constructor(
    private readonly routeDirections: RouteDirectionsService,
    private readonly matchSquare: MatchSquareService,
  ) {}

  async launchRecruitment(
    userId: string,
    templateId: number,
    dto: LaunchRecruitmentFromTemplateInput,
  ): Promise<LaunchRecruitmentFromTemplateResultView> {
    const template = await this.routeDirections.findRouteTemplateById(templateId);
    if (!template.isActive) {
      throw new BadRequestException('该路线模板未激活，无法发起招募');
    }

    const routeDirection = template.routeDirection;
    if (!routeDirection) {
      throw new NotFoundException('路线模板缺少关联 RouteDirection');
    }

    const catalog = resolveCatalogEntryForRouteTemplate({
      routeDirectionName: routeDirection.name,
      durationDays: template.durationDays,
      templateMetadata: template.metadata,
    });
    if (!catalog) {
      throw new BadRequestException(
        `模板 ${templateId} 尚未纳入 Match Square catalog（${routeDirection.name} / ${template.durationDays}d）`,
      );
    }

    const result = await this.matchSquare.createPostFromRouteTemplateLaunch(userId, {
      template: {
        id: template.id,
        uuid: template.uuid,
        name: template.name,
        durationDays: template.durationDays,
        routeDirectionName: routeDirection.name,
        routeDirectionNameCn: routeDirection.nameCN,
      },
      catalog,
      dto,
    });

    this.logger.log(
      `Launch recruitment from template=${templateId} catalog=${catalog.catalogId} post=${result.recruitmentPostId}`,
    );

    return result;
  }
}
