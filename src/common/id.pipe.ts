import { BadRequestException, ParseIntPipe } from '@nestjs/common';

/** 주소의 :id가 숫자가 아니면 쉬운 안내를 돌려준다. */
export const idPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('번호가 올바르지 않아요.'),
});
