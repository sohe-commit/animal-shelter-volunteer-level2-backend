import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleDto {
  @IsInt({ message: '활동 종류를 골라 주세요.' })
  activityId: number;

  @IsNotEmpty({ message: '날짜를 골라 주세요.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜는 2026-11-03처럼 적어 주세요.' })
  date: string;

  @IsNotEmpty({ message: '시작 시간을 적어 주세요.' })
  @Matches(TIME_RE, { message: '시작 시간은 10:00처럼 적어 주세요.' })
  startTime: string;

  @IsNotEmpty({ message: '끝나는 시간을 적어 주세요.' })
  @Matches(TIME_RE, { message: '끝나는 시간은 14:00처럼 적어 주세요.' })
  endTime: string;

  @Transform(trim)
  @IsNotEmpty({ message: '장소를 적어 주세요.' })
  @IsString({ message: '장소를 글자로 적어 주세요.' })
  @MaxLength(100, { message: '장소는 100자 안으로 적어 주세요.' })
  place: string;

  @Transform(trim)
  @IsOptional()
  @IsString({ message: '준비물을 글자로 적어 주세요.' })
  @MaxLength(300, { message: '준비물은 300자 안으로 적어 주세요.' })
  supplies?: string;

  @Transform(trim)
  @IsOptional()
  @IsString({ message: '주의사항을 글자로 적어 주세요.' })
  @MaxLength(500, { message: '주의사항은 500자 안으로 적어 주세요.' })
  notes?: string;

  @IsBoolean({ message: '봉사 인정 증서를 주는지 골라 주세요.' })
  givesCertificate: boolean;
}
