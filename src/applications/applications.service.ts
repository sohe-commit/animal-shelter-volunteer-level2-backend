import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../db/database.service.js';
import {
  WEEKLY_LIMIT,
  canCancelAt,
  cancelDeadline,
  formatDeadline,
  formatShortDate,
  todayKst,
  usedWeeklyCount,
  weekRange,
} from '../rules.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import type { ApplyDto, IdentityDto } from './applications.dto.js';

interface ApplicationRow {
  id: number;
  status: 'applied' | 'cancelled';
  createdAt: Date;
  cancelledAt: Date | null;
  scheduleId: number;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  activityName: string;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly schedules: SchedulesService,
  ) {}

  /** 봉사 신청. 규칙 R1(정원), R2(주 2회), R4(같은 날 중복), R5(지난 일정)를 확인한다. */
  apply(scheduleId: number, dto: ApplyDto) {
    return this.db.transaction(async (client) => {
      // 일정 줄을 잠가서, 마지막 한 자리에 동시에 신청이 와도 한 건씩 차례로 처리한다.
      const scheduleRows = await client.query<{ date: string; capacity: number; activityName: string }>(
        `SELECT to_char(s.date, 'YYYY-MM-DD') AS date, a.capacity, a.name AS "activityName"
         FROM schedules s JOIN activities a ON a.id = s.activity_id
         WHERE s.id = $1 FOR UPDATE OF s`,
        [scheduleId],
      );
      if (scheduleRows.rowCount === 0) {
        throw new NotFoundException('봉사 일정을 찾을 수 없어요.');
      }
      const schedule = scheduleRows.rows[0];

      // R5: 오늘이나 지난 날짜의 일정은 신청할 수 없다.
      if (schedule.date <= todayKst()) {
        throw new BadRequestException('이미 지난 일정이에요. 내일 이후의 일정을 골라 주세요.');
      }

      const volunteerId = await this.findOrCreateVolunteer(client, dto);

      // R4: 봉사는 하루에 한 번이라 같은 날 두 활동을 신청할 수 없다.
      const sameDay = await client.query<{ scheduleId: number; activityName: string }>(
        `SELECT s.id AS "scheduleId", a.name AS "activityName"
         FROM applications ap
         JOIN schedules s ON s.id = ap.schedule_id
         JOIN activities a ON a.id = s.activity_id
         WHERE ap.volunteer_id = $1 AND ap.status = 'applied' AND s.date = $2`,
        [volunteerId, schedule.date],
      );
      if (sameDay.rowCount) {
        const existing = sameDay.rows[0];
        throw new ConflictException(
          existing.scheduleId === scheduleId
            ? '이미 이 일정에 신청하셨어요.'
            : `이 날은 이미 ${existing.activityName} 활동을 신청하셨어요. 봉사는 하루에 한 번만 할 수 있어요.`,
        );
      }

      // R1: 정원을 넘을 수 없다.
      const applied = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM applications WHERE schedule_id = $1 AND status = 'applied'`,
        [scheduleId],
      );
      if (applied.rows[0].count >= schedule.capacity) {
        throw new ConflictException(
          `이 활동은 정원(${schedule.capacity}명)이 다 찼어요. 다른 날짜를 골라 보세요.`,
        );
      }

      // R2: 봉사 날짜가 속한 주(일~토)에 2번까지. 3번째 취소부터는 횟수에 넣는다.
      const week = weekRange(schedule.date);
      const used = await this.weeklyUsage(client, volunteerId, week.start, week.end);
      if (used >= WEEKLY_LIMIT) {
        throw new ConflictException(
          `이번 주(${formatShortDate(week.start)}~${formatShortDate(week.end)})에는 이미 ${WEEKLY_LIMIT}번 신청하셨어요. ` +
            '한 주에 2번까지 신청할 수 있어요. (취소를 3번 이상 하면 그때부터는 취소도 횟수에 들어가요.)',
        );
      }

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO applications (schedule_id, volunteer_id) VALUES ($1, $2) RETURNING id`,
        [scheduleId, volunteerId],
      );
      return {
        id: inserted.rows[0].id,
        message: `${schedule.activityName} 봉사 신청이 완료됐어요.`,
        cancelDeadline: cancelDeadline(schedule.date),
      };
    });
  }

  /** 내 신청 찾기: 이름 + 전화번호로 신청 목록과, 고를 수 있는 주마다 남은 횟수를 돌려준다. */
  async lookup(dto: IdentityDto) {
    const weeks = await this.schedules.selectableWeeks();
    const volunteers = await this.db.query<{ id: number }>(
      'SELECT id FROM volunteers WHERE name = $1 AND phone = $2',
      [dto.name, dto.phone],
    );
    if (volunteers.length === 0) {
      return {
        found: false,
        weeks: weeks.map((w) => ({ ...w, used: 0, remaining: WEEKLY_LIMIT })),
        monthly: [],
        applications: [],
      };
    }
    const volunteerId = volunteers[0].id;

    const rows = await this.db.query<ApplicationRow>(
      `SELECT ap.id, ap.status, ap.created_at AS "createdAt", ap.cancelled_at AS "cancelledAt",
              s.id AS "scheduleId", to_char(s.date, 'YYYY-MM-DD') AS date,
              to_char(s.start_time, 'HH24:MI') AS "startTime", to_char(s.end_time, 'HH24:MI') AS "endTime",
              s.place, a.name AS "activityName"
       FROM applications ap
       JOIN schedules s ON s.id = ap.schedule_id
       JOIN activities a ON a.id = s.activity_id
       WHERE ap.volunteer_id = $1
       ORDER BY s.date DESC, ap.created_at DESC`,
      [volunteerId],
    );
    const usage = await Promise.all(
      weeks.map((w) => this.weeklyUsage(this.db.pooled, volunteerId, w.start, w.end)),
    );

    // 월별 기록: 신청 횟수 = 그 달이 봉사 날짜인 신청(취소 제외), 봉사 횟수 = 그중 봉사 날짜가 지난 것
    const today = todayKst();
    const monthly = new Map<string, { month: string; appliedCount: number; servedCount: number }>();
    for (const row of rows) {
      if (row.status !== 'applied') continue;
      const month = row.date.slice(0, 7);
      const entry = monthly.get(month) ?? { month, appliedCount: 0, servedCount: 0 };
      entry.appliedCount += 1;
      if (row.date < today) entry.servedCount += 1;
      monthly.set(month, entry);
    }

    const now = new Date();
    return {
      found: true,
      weeks: weeks.map((w, i) => ({ ...w, used: usage[i], remaining: Math.max(0, WEEKLY_LIMIT - usage[i]) })),
      monthly: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)),
      applications: rows.map((row) => ({
        ...row,
        weekStart: weekRange(row.date).start,
        cancelDeadline: cancelDeadline(row.date),
        canCancel: row.status === 'applied' && canCancelAt(row.date, now),
      })),
    };
  }

  /** 신청 취소. 규칙 R3(전날 낮 12시 마감), R6(본인만 취소)을 확인한다. */
  cancel(id: number, dto: IdentityDto) {
    return this.db.transaction(async (client) => {
      const rows = await client.query<{ status: string; name: string; phone: string; date: string; activityName: string }>(
        `SELECT ap.status, v.name, v.phone, to_char(s.date, 'YYYY-MM-DD') AS date, a.name AS "activityName"
         FROM applications ap
         JOIN volunteers v ON v.id = ap.volunteer_id
         JOIN schedules s ON s.id = ap.schedule_id
         JOIN activities a ON a.id = s.activity_id
         WHERE ap.id = $1 FOR UPDATE OF ap`,
        [id],
      );
      if (rows.rowCount === 0) {
        throw new NotFoundException('신청을 찾을 수 없어요.');
      }
      const application = rows.rows[0];

      // R6: 신청할 때 쓴 이름과 전화번호가 맞아야 취소할 수 있다.
      if (application.name !== dto.name || application.phone !== dto.phone) {
        throw new ForbiddenException('신청 정보가 일치하지 않아요. 신청할 때 쓴 이름과 전화번호를 확인해 주세요.');
      }
      if (application.status === 'cancelled') {
        throw new BadRequestException('이미 취소된 신청이에요.');
      }

      // R3: 봉사 전날 낮 12시 전까지만 취소할 수 있다.
      if (!canCancelAt(application.date)) {
        throw new BadRequestException(
          `취소는 봉사 전날 낮 12시 전까지만 할 수 있어요. (마감: ${formatDeadline(application.date)})`,
        );
      }

      await client.query(`UPDATE applications SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id]);
      return { id, message: `${application.activityName} 봉사 신청을 취소했어요.` };
    });
  }

  /** 처음 신청하는 사람이면 봉사자로 등록하고, 그 사람의 줄을 잠가서 R2·R4 확인이 겹치지 않게 한다. */
  private async findOrCreateVolunteer(client: PoolClient, dto: ApplyDto): Promise<number> {
    await client.query(
      `INSERT INTO volunteers (name, phone, is_minor) VALUES ($1, $2, $3)
       ON CONFLICT (name, phone) DO NOTHING`,
      [dto.name, dto.phone, dto.isMinor ?? false],
    );
    const rows = await client.query<{ id: number }>(
      'SELECT id FROM volunteers WHERE name = $1 AND phone = $2 FOR UPDATE',
      [dto.name, dto.phone],
    );
    return rows.rows[0].id;
  }

  /** R2: 그 주에 쓴 신청 횟수 */
  private async weeklyUsage(
    client: Pick<PoolClient, 'query'>,
    volunteerId: number,
    start: string,
    end: string,
  ): Promise<number> {
    const result = await client.query<{ active: number; cancelled: number }>(WEEKLY_USAGE_SQL, [volunteerId, start, end]);
    const { active, cancelled } = result.rows[0];
    return usedWeeklyCount(active, cancelled);
  }
}

const WEEKLY_USAGE_SQL = `
  SELECT COUNT(*) FILTER (WHERE ap.status = 'applied')::int AS active,
         COUNT(*) FILTER (WHERE ap.status = 'cancelled')::int AS cancelled
  FROM applications ap JOIN schedules s ON s.id = ap.schedule_id
  WHERE ap.volunteer_id = $1 AND s.date BETWEEN $2 AND $3`;
