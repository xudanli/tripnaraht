import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Gate1AccessService } from '../services/gate1-access.service';

@Injectable()
export class Gate1AdvisorAccessGuard implements CanActivate {
  constructor(private readonly access: Gate1AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }
    const projectId = request.params.projectId ?? request.params.id;
    if (!projectId) return true;
    await this.access.assertAdvisorProjectAccess(projectId, user.userId, user.roles);
    return true;
  }
}
