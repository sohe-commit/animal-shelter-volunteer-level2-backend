import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { normalizePhone } from '../rules.js';

/** 봉사자를 구분하는 이름 + 전화번호 (내 신청 찾기, 취소) */
export class IdentityDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: '이름을 적어 주세요.' })
  @IsString({ message: '이름을 글자로 적어 주세요.' })
  @Length(2, 20, { message: '이름은 2~20자로 적어 주세요.' })
  name: string;

  @Transform(({ value }) => normalizePhone(value))
  @IsNotEmpty({ message: '전화번호를 적어 주세요.' })
  @Matches(/^010-\d{4}-\d{4}$/, { message: '전화번호는 010-1234-5678처럼 숫자로 적어 주세요.' })
  phone: string;
}

export class ApplyDto extends IdentityDto {
  @IsOptional()
  @IsBoolean({ message: '미성년자 여부는 예 또는 아니오로 골라 주세요.' })
  isMinor?: boolean;
}
