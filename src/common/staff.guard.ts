import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const STAFF_HEADER = 'x-staff-password';

/** 담당자 비밀번호가 맞는지 확인한다. 비밀번호는 STAFF_PASSWORD 설정값에만 있다. */
export function isStaffPassword(given: unknown): boolean {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) {
    throw new ServiceUnavailableException('담당자 비밀번호가 서버에 설정되지 않았어요. STAFF_PASSWORD를 넣어 주세요.');
  }
  if (typeof given !== 'string' || given.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 담당자만 쓸 수 있는 기능(일정 등록, 현황, 데이터 초기화)에 붙인다. */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isStaffPassword(request.headers[STAFF_HEADER])) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'STAFF_REQUIRED',
        message: '담당자만 쓸 수 있는 기능이에요. 담당자 모드에서 비밀번호를 넣어 주세요.',
      });
    }
    return true;
  }
}
