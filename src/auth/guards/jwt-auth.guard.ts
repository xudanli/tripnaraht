// src/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Even for public routes, try to extract and validate token if provided
      // This allows @CurrentUser() to work even on public routes
      const request = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(request);
      
      if (token) {
        // Try to validate token and set user, but don't fail if invalid
        // Use Promise.resolve to handle both sync and async results
        const result = super.canActivate(context);
        if (result instanceof Promise) {
          return result.then(
            (res) => res,
            () => true // If validation fails, still allow (it's a public route)
          );
        }
        return result;
      }
      
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // For public routes, if token is invalid, just return undefined user
    // This allows the route to proceed but @CurrentUser() will be undefined
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // For public routes, don't throw error if token is invalid
      // But if token is valid, return the user
      if (err || !user) {
        return undefined;
      }
      return user;
    }

    // For protected routes, use default behavior (throw error if invalid)
    if (err || !user) {
      throw err || new Error('Unauthorized');
    }
    return user;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

