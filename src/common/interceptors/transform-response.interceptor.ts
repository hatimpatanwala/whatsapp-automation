import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, any>;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function transformKeys(obj: any, seen = new WeakSet()): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Buffer.isBuffer(obj)) return obj;

  // Prevent circular reference infinite recursion
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  if (Array.isArray(obj)) return obj.map(item => transformKeys(item, seen));

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[snakeToCamel(key)] = transformKeys(obj[key], seen);
  }
  return result;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data already has the expected shape, pass through
        if (data && data.success !== undefined) {
          return data;
        }

        return {
          success: true,
          data: transformKeys(data),
        };
      }),
    );
  }
}
