// 규칙 계산에 쓰는 작은 함수들. 날짜와 시간은 모두 한국 시간(Asia/Seoul) 기준이다.

/** R2: 한 사람이 한 주(일~토)에 신청할 수 있는 횟수 */
export const WEEKLY_LIMIT = 2;
/** R2: 한 주에 횟수로 세지 않는 취소 횟수 (3번째 취소부터 횟수에 넣음) */
export const FREE_CANCELS_PER_WEEK = 2;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  return KST_DATE.format(now);
}

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 그 날짜가 속한 주의 일요일과 토요일 */
export function weekRange(date: string): { start: string; end: string } {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const start = addDays(date, -dayOfWeek);
  return { start, end: addDays(start, 6) };
}

/**
 * 화면에서 고를 수 있는 주 목록: 이번 주부터 마지막 일정이 있는 주까지.
 * 일정이 없으면 이번 주 하나만 돌려준다.
 */
export function selectableWeeks(today: string, lastScheduleDate: string | null): { start: string; end: string }[] {
  const weeks = [weekRange(today)];
  const last = lastScheduleDate && lastScheduleDate > today ? weekRange(lastScheduleDate).start : weeks[0].start;
  while (weeks[weeks.length - 1].start < last) {
    weeks.push(weekRange(addDays(weeks[weeks.length - 1].start, 7)));
  }
  return weeks;
}

/** R3: 취소 마감 = 봉사 전날 낮 12시 (한국 시간) */
export function cancelDeadline(date: string): Date {
  return new Date(`${addDays(date, -1)}T12:00:00+09:00`);
}

export function canCancelAt(date: string, now: Date = new Date()): boolean {
  return now.getTime() < cancelDeadline(date).getTime();
}

/** R2: 이번 주에 쓴 횟수 = 신청 중인 건수 + (취소 건수 중 3번째부터) */
export function usedWeeklyCount(active: number, cancelled: number): number {
  return active + Math.max(0, cancelled - FREE_CANCELS_PER_WEEK);
}

/** 현황 화면에 이름을 가려서 보여 준다. 김봉사 → 김*사, 김봉 → 김* */
export function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

/** 010-1234-5678, 01012345678, 010 1234 5678 → 010-1234-5678 */
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 11월 2일 낮 12시 */
export function formatDeadline(date: string): string {
  const prev = addDays(date, -1);
  return `${Number(prev.slice(5, 7))}월 ${Number(prev.slice(8, 10))}일 낮 12시`;
}

/** 10/25 */
export function formatShortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
