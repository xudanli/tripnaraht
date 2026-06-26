import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Gate1AccessService } from '../services/gate1-access.service';

@Injectable()
export class Gate1OpsAccessGuard implements CanActivate {
  constructor(private readonly access: Gate1AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }
    await this.access.assertOpsAccess(user.userId, user.roles);
    return true;
  }
}
