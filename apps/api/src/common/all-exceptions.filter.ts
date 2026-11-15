import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './errors';

/**
 * One global filter: map typed domain errors to HTTP and never leak raw
 * library errors, stack traces, secrets or PII. 4xx messages are safe and
 * user-facing; every 5xx uses a single generic message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof DomainError) {
      this.logger.warn(
        `domain_error code=${exception.code} method=${request.method} path=${request.path}`,
      );
      if (exception.httpStatus < 500) {
        this.send(response, exception.httpStatus, exception.code, exception.message);
      } else {
        this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', this.genericMessage());
      }
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Do not forward the framework message verbatim; it may echo input.
      this.send(
        response,
        status,
        'HTTP_ERROR',
        status < 500 ? 'Request failed' : this.genericMessage(),
      );
      return;
    }

    // Unknown / raw error: log only a shape-safe tag, never the error body.
    const name = exception instanceof Error ? exception.name : 'NonError';
    this.logger.error(`unhandled_error type=${name} method=${request.method} path=${request.path}`);
    this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', this.genericMessage());
  }

  private genericMessage(): string {
    return 'An unexpected error occurred';
  }

  private send(response: Response, status: number, code: string, message: string): void {
    response.status(status).json({ error: { code, message } });
  }
}
