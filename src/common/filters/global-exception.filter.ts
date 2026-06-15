import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

let Sentry: any;
try {
  Sentry = require('@sentry/node');
} catch {
  // Sentry is optional
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        errors = (exceptionResponse as any).errors;
      }
    } else if (exception instanceof Error) {
      // Do NOT expose internal error details (DB/SQL fragments, host names,
      // SSRF probe results) to clients. Log full detail server-side; return a
      // generic message with the requestId for support correlation.
      this.logger.error(
        `[${request['requestId']}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      message = 'Internal server error';
    }

    // Send 5xx errors to Sentry for aggregation and alerting
    if (Sentry && (!(exception instanceof HttpException) || status >= 500)) {
      Sentry.captureException(exception, {
        tags: {
          tenantId: (request as any).tenantContext?.id,
          path: request.url,
          method: request.method,
        },
        extra: {
          requestId: request['requestId'],
          statusCode: status,
        },
      });
    }

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        errors,
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request['requestId'],
      },
    });
  }
}
