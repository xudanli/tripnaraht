// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl } = request;
    const start = Date.now();

    // 立即打印请求到达日志
    console.log(`[HTTP] 请求到达: ${method} ${originalUrl}`);
    this.logger.log(`请求到达: ${method} ${originalUrl}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - start;
          const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
          console.log(`[HTTP] ${logMessage}`);
          this.logger.log(logMessage);
        },
        error: (error) => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode || 500;
          const duration = Date.now() - start;
          const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms [ERROR]`;
          console.error(`[HTTP] ${logMessage}`, error?.message);
          this.logger.error(logMessage, error?.stack);
        },
      }),
    );
  }
}

