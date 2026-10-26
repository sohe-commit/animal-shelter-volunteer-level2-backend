import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  type ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

/** 입력 검사에 걸리면 첫 번째 안내 문구를 message로, 전체를 errors로 돌려준다. */
export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = errors.flatMap((error) => {
    const constraints = error.constraints ?? {};
    // 빈칸이면 "적어 주세요" 안내 하나만 보여 준다.
    if (constraints.isNotEmpty) return [constraints.isNotEmpty];
    return Object.values(constraints).slice(0, 1);
  });
  return new BadRequestException({
    statusCode: 400,
    message: messages[0] ?? '입력한 내용을 다시 확인해 주세요.',
    errors: messages,
  });
}

/** 예상하지 못한 오류도 쉬운 문구로 돌려준다. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response.status(exception.getStatus()).json(
        typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body,
      );
      return;
    }
    this.logger.error(exception);
    response.status(500).json({ statusCode: 500, message: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
  }
}
