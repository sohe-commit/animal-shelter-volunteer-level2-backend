import {
  canCancelAt,
  maskName,
  normalizePhone,
  selectableWeeks,
  todayKst,
  usedWeeklyCount,
  weekRange,
} from './rules.js';

describe('rules', () => {
  it('주는 일요일부터 토요일까지다', () => {
    // 2026-10-28은 수요일
    expect(weekRange('2026-10-28')).toEqual({ start: '2026-10-25', end: '2026-10-31' });
    expect(weekRange('2026-10-25')).toEqual({ start: '2026-10-25', end: '2026-10-31' });
    expect(weekRange('2026-10-31')).toEqual({ start: '2026-10-25', end: '2026-10-31' });
  });

  it('고를 수 있는 주는 이번 주부터 마지막 일정이 있는 주까지다', () => {
    expect(selectableWeeks('2026-10-26', '2026-11-09')).toEqual([
      { start: '2026-10-25', end: '2026-10-31' },
      { start: '2026-11-01', end: '2026-11-07' },
      { start: '2026-11-08', end: '2026-11-14' },
    ]);
    expect(selectableWeeks('2026-10-26', null)).toEqual([{ start: '2026-10-25', end: '2026-10-31' }]);
    expect(selectableWeeks('2026-10-26', '2026-10-20')).toEqual([{ start: '2026-10-25', end: '2026-10-31' }]);
  });

  it('취소한 신청은 2번까지 세지 않고, 3번째 취소부터 센다', () => {
    expect(usedWeeklyCount(1, 0)).toBe(1);
    expect(usedWeeklyCount(1, 2)).toBe(1);
    expect(usedWeeklyCount(0, 3)).toBe(1);
    expect(usedWeeklyCount(1, 4)).toBe(3);
  });

  it('취소는 봉사 전날 낮 12시 전까지만 된다', () => {
    expect(canCancelAt('2026-11-03', new Date('2026-11-02T11:59:59+09:00'))).toBe(true);
    expect(canCancelAt('2026-11-03', new Date('2026-11-02T12:00:00+09:00'))).toBe(false);
    expect(canCancelAt('2026-11-03', new Date('2026-11-03T09:00:00+09:00'))).toBe(false);
  });

  it('오늘 날짜는 한국 시간으로 계산한다', () => {
    // UTC 10/26 16:00 = 한국 10/27 01:00
    expect(todayKst(new Date('2026-10-26T16:00:00Z'))).toBe('2026-10-27');
  });

  it('이름을 가린다', () => {
    expect(maskName('김봉사')).toBe('김*사');
    expect(maskName('김봉')).toBe('김*');
    expect(maskName('남궁하늘')).toBe('남**늘');
  });

  it('전화번호 형식을 맞춘다', () => {
    expect(normalizePhone('01012345678')).toBe('010-1234-5678');
    expect(normalizePhone('010 1234 5678')).toBe('010-1234-5678');
    expect(normalizePhone('1234')).toBe('1234');
  });
});
