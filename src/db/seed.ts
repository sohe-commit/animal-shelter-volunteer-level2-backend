import type { PoolClient } from 'pg';
import { addDays, todayKst, weekRange } from '../rules.js';

// 시연용 가상 데이터. 이름과 전화번호는 모두 지어낸 값이다.

const ACTIVITIES = [
  {
    name: '산책',
    capacity: 2,
    description: '보호견과 함께 보호소 주변 산책로를 걸어요.',
    place: '보호소 앞 산책로',
    supplies: '편한 운동화, 물',
    notes: '대형견은 2인 1조로 산책해요. 목줄은 손목에 한 번 감아 주세요.',
  },
  {
    name: '청소',
    capacity: 3,
    description: '견사와 묘사를 깨끗하게 청소하고 소독해요.',
    place: '보호소 1·2동 견사',
    supplies: '장화, 갈아입을 옷',
    notes: '소독약이 피부에 닿지 않게 고무장갑을 꼭 껴 주세요.',
  },
  {
    name: '목욕',
    capacity: 3,
    description: '보호견을 씻기고 털을 말려 줘요.',
    place: '보호소 목욕실',
    supplies: '방수 앞치마, 갈아입을 옷',
    notes: '물 온도는 미지근하게 맞춰요. 겁먹은 아이는 무리하지 않아요.',
  },
  {
    name: '미용',
    capacity: 4,
    description: '엉킨 털을 정리하고 발톱을 다듬어요.',
    place: '보호소 미용실',
    supplies: '편한 옷, 앞치마',
    notes: '가위와 클리퍼는 담당 직원 안내에 따라 사용해요.',
  },
  {
    name: '사진',
    capacity: 2,
    description: '입양 홍보용으로 보호동물의 사진을 찍어요.',
    place: '보호소 마당',
    supplies: '휴대폰 또는 카메라, 보조배터리',
    notes: '플래시는 쓰지 않아요. 동물이 놀라지 않게 천천히 다가가요.',
  },
];

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
const GIVEN_NAMES = [
  '봉사', '나눔', '하늘', '바다', '온기', '다솜', '새봄', '한결',
  '보람', '미소', '가람', '누리', '소망', '햇살', '초롱',
];
const VOLUNTEER_COUNT = 30;
const DAYS_BEFORE = 14;
const DAYS_AFTER = 14;
const TARGET_APPLICATIONS = 120;

/** 매번 같은 가상 데이터가 나오도록 고정된 씨앗으로 만든 난수 */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function insertRows(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<number[]> {
  if (rows.length === 0) return [];
  const params: unknown[] = [];
  const values = rows.map((row) => {
    const placeholders = row.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const result = await client.query<{ id: number }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')} RETURNING id`,
    params,
  );
  return result.rows.map((r) => r.id);
}

export interface SeedResult {
  activities: number;
  schedules: number;
  volunteers: number;
  applications: number;
}

/** 빈 테이블에 가상 데이터를 채운다. 신청은 규칙(R1·R2·R4)을 지키도록 만든다. */
export async function seedDemoData(client: PoolClient, now: Date = new Date()): Promise<SeedResult> {
  const random = seededRandom(20261026);
  const today = todayKst(now);

  const activityIds = await insertRows(
    client,
    'activities',
    ['name', 'capacity', 'description'],
    ACTIVITIES.map((a) => [a.name, a.capacity, a.description]),
  );

  const schedules: { date: string; activityIndex: number; capacity: number }[] = [];
  for (let offset = -DAYS_BEFORE; offset <= DAYS_AFTER; offset++) {
    const date = addDays(today, offset);
    ACTIVITIES.forEach((activity, activityIndex) => {
      schedules.push({ date, activityIndex, capacity: activity.capacity });
    });
  }
  const scheduleIds = await insertRows(
    client,
    'schedules',
    ['activity_id', 'date', 'start_time', 'end_time', 'place', 'supplies', 'notes', 'gives_certificate', 'created_at'],
    schedules.map((s) => {
      const a = ACTIVITIES[s.activityIndex];
      return [
        activityIds[s.activityIndex],
        s.date,
        '10:00',
        '14:00',
        a.place,
        a.supplies,
        a.notes,
        a.name !== '사진',
        new Date(`${addDays(today, -DAYS_BEFORE - 7)}T09:00:00+09:00`),
      ];
    }),
  );

  const volunteerIds = await insertRows(
    client,
    'volunteers',
    ['name', 'phone', 'is_minor', 'created_at'],
    Array.from({ length: VOLUNTEER_COUNT }, (_, i) => [
      SURNAMES[i % SURNAMES.length] + GIVEN_NAMES[i % GIVEN_NAMES.length],
      `010-0000-${String(i + 1).padStart(4, '0')}`,
      i % 7 === 3,
      new Date(`${addDays(today, -DAYS_BEFORE - 7)}T09:00:00+09:00`),
    ]),
  );

  // 규칙을 지키는지 메모리에서 세어 가며 신청을 만든다.
  const appliedBySchedule = new Map<number, number>();
  const busyDays = new Set<string>(); // 봉사자|날짜 (R4)
  const weeklyActive = new Map<string, number>(); // 봉사자|주 시작일 (R2)
  const weeklyCancelled = new Set<string>();
  const applications: unknown[][] = [];

  const tryAdd = (scheduleIndex: number, volunteerIndex: number, cancelled: boolean): boolean => {
    const s = schedules[scheduleIndex];
    const weekKey = `${volunteerIndex}|${weekRange(s.date).start}`;
    if (busyDays.has(`${volunteerIndex}|${s.date}`)) return false;
    if (cancelled) {
      // 취소는 한 사람이 한 주에 한 번만 넣어서 R2 계산이 단순하게 유지되게 한다.
      if (weeklyCancelled.has(weekKey)) return false;
      weeklyCancelled.add(weekKey);
    } else {
      if ((appliedBySchedule.get(scheduleIndex) ?? 0) >= s.capacity) return false;
      if ((weeklyActive.get(weekKey) ?? 0) >= 2) return false;
      appliedBySchedule.set(scheduleIndex, (appliedBySchedule.get(scheduleIndex) ?? 0) + 1);
      weeklyActive.set(weekKey, (weeklyActive.get(weekKey) ?? 0) + 1);
      busyDays.add(`${volunteerIndex}|${s.date}`);
    }

    // 신청 시각: 지난 일정은 봉사 1~10일 전, 앞으로의 일정은 최근 며칠 사이
    const daysBefore = 1 + Math.floor(random() * 10);
    const createdDate = s.date > today ? addDays(today, -Math.floor(random() * 5)) : addDays(s.date, -daysBefore);
    const createdAt = new Date(`${createdDate}T${String(8 + Math.floor(random() * 10)).padStart(2, '0')}:00:00+09:00`);
    const createdAtSafe = createdAt > now ? now : createdAt;
    const cancelledAt = cancelled ? new Date(Math.min(createdAtSafe.getTime() + 3_600_000, now.getTime())) : null;

    applications.push([
      scheduleIds[scheduleIndex],
      volunteerIds[volunteerIndex],
      cancelled ? 'cancelled' : 'applied',
      createdAtSafe,
      cancelledAt,
      cancelled ? 'volunteer' : null,
    ]);
    return true;
  };

  // "신청 가능한 것만 보기"를 시연할 수 있게 앞으로의 일정 두 개는 정원을 꽉 채운다.
  const fullSchedules = [
    schedules.findIndex((s) => s.date === addDays(today, 2) && s.activityIndex === 0),
    schedules.findIndex((s) => s.date === addDays(today, 3) && s.activityIndex === 4),
  ];
  for (const scheduleIndex of fullSchedules) {
    let volunteerIndex = 0;
    while ((appliedBySchedule.get(scheduleIndex) ?? 0) < schedules[scheduleIndex].capacity) {
      tryAdd(scheduleIndex, volunteerIndex++, false);
    }
  }

  // 인기 활동과 활동적인 봉사자가 드러나도록 미용과 앞쪽 봉사자를 조금 더 자주 뽑는다.
  for (let attempt = 0; applications.length < TARGET_APPLICATIONS && attempt < 10_000; attempt++) {
    const preferGrooming = random() < 0.25;
    const candidates = preferGrooming
      ? schedules.map((s, i) => (s.activityIndex === 3 ? i : -1)).filter((i) => i >= 0)
      : schedules.map((_, i) => i);
    const scheduleIndex = candidates[Math.floor(random() * candidates.length)];
    const volunteerIndex = Math.floor(random() ** 1.6 * VOLUNTEER_COUNT);
    tryAdd(scheduleIndex, volunteerIndex, random() < 0.1);
  }

  await insertRows(
    client,
    'applications',
    ['schedule_id', 'volunteer_id', 'status', 'created_at', 'cancelled_at', 'cancelled_by'],
    applications,
  );

  return {
    activities: activityIds.length,
    schedules: scheduleIds.length,
    volunteers: volunteerIds.length,
    applications: applications.length,
  };
}

/**
 * 오늘부터 2주 뒤까지, 활동마다 일정이 없는 날짜에 기본 일정을 채운다.
 * 시간이 지나도 신청할 일정이 바닥나지 않게 하려는 것이다.
 * 담당자가 취소한 날짜는 기록이 남아 있으므로 다시 채우지 않는다.
 */
export async function fillUpcomingSchedules(client: Pick<PoolClient, 'query'>, now: Date = new Date()): Promise<number> {
  const today = todayKst(now);
  let added = 0;
  for (const a of ACTIVITIES) {
    const result = await client.query(
      `INSERT INTO schedules (activity_id, date, start_time, end_time, place, supplies, notes, gives_certificate)
       SELECT a.id, d::date, '10:00', '14:00', $2, $3, $4, $5
       FROM activities a, generate_series($6::date, $7::date, interval '1 day') d
       WHERE a.name = $1
         AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.activity_id = a.id AND s.date = d::date)
       ON CONFLICT (activity_id, date) WHERE cancelled_at IS NULL DO NOTHING`,
      [a.name, a.place, a.supplies, a.notes, a.name !== '사진', today, addDays(today, DAYS_AFTER)],
    );
    added += result.rowCount ?? 0;
  }
  return added;
}
