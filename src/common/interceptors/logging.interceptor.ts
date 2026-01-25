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
    const response = context.switchToHttp().getResponse();
    const { method, originalUrl } = request;
    const start = Date.now();

    // 立即打印请求到达日志
    console.log(`[HTTP-Interceptor] 请求到达: ${method} ${originalUrl}`);
    this.logger.log(`[Interceptor] 请求到达: ${method} ${originalUrl}`);

    // 监听响应事件（确保捕获使用 @Res() 的情况）
    const logResponse = () => {
      const statusCode = response.statusCode || 200;
      const duration = Date.now() - start;
      const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
      console.log(`[HTTP-Interceptor] ${logMessage}`);
      this.logger.log(`[Interceptor] ${logMessage}`);
    };

    // 监听响应完成事件（处理 @Res({ passthrough: true }) 的情况）
    response.once('finish', logResponse);
    response.once('close', () => {
      if (!response.writableFinished) {
        logResponse();
      }
    });

    return next.handle().pipe(
      tap({
        next: () => {
          // 如果响应还没有完成，等待 finish 事件
          // 如果已经完成，立即记录
          if (response.writableFinished || response.headersSent) {
            logResponse();
          }
        },
        error: (error) => {
          // 等待响应完成后再记录，确保状态码已设置
          // 对于异常，状态码会在异常过滤器中设置
          const logError = () => {
            const statusCode = response.statusCode || (error?.status || 500);
            const duration = Date.now() - start;
            const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms [ERROR]`;
            console.error(`[HTTP-Interceptor] ${logMessage}`, error?.message);
            this.logger.error(`[Interceptor] ${logMessage}`, error?.stack);
          };
          
          // 如果响应已完成，立即记录；否则等待 finish 事件
          if (response.writableFinished || response.headersSent) {
            logError();
          } else {
            response.once('finish', logError);
          }
        },
      }),
    );
  }
}

