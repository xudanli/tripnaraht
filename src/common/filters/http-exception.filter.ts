// src/common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || responseObj.error || message;
        errorCode = responseObj.errorCode;
      } else {
        message = exception.message || message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        `${request.method} ${request.url}`,
      );
    } else if (typeof exception === 'string') {
      message = exception;
    } else {
      this.logger.error(
        `Unknown exception type: ${JSON.stringify(exception)}`,
        undefined,
        `${request.method} ${request.url}`,
      );
    }

    // Log the error for debugging (don't log 400 errors in production to reduce noise)
    if (status >= 500 || process.env.NODE_ENV !== 'production') {
      this.logger.error(
        `${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`,
      );
    }

    // Send error response
    const errorResponse: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    // Add message (can be string or array)
    if (Array.isArray(message)) {
      errorResponse.message = message;
    } else {
      errorResponse.message = [message as string];
    }

    // Add error code if present
    if (errorCode) {
      errorResponse.errorCode = errorCode;
    }

    // In production, don't expose internal error details for 500 errors
    if (status >= 500 && process.env.NODE_ENV === 'production') {
      errorResponse.message = ['Internal server error'];
    }

    response.status(status).json(errorResponse);
  }
}
