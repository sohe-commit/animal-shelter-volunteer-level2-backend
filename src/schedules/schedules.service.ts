import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../db/database.service.js';
import { canCancelAt, cancelDeadline, isValidDate, selectableWeeks, todayKst, weekRange } from '../rules.js';
import type { CancelScheduleDto, CreateScheduleDto } from './schedules.dto.js';

interface ScheduleRow {
  id: number;
  activityId: number;
  activityName: string;
  activityDescription: string;
  capacity: number;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  supplies: string;
  notes: string;
  givesCertificate: boolean;
  appliedCount: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface ScheduleFilter {
  /** 주(일~토). 그 주의 아무 날짜나 넣으면 그 주 전체를 보여 준다. */
  week?: string;
  activityId?: string;
  available?: string;
}

const SCHEDULE_SELECT = `
  SELECT s.id,
         a.id AS "activityId",
         a.name AS "activityName",
         a.description AS "activityDescription",
         a.capacity,
         to_char(s.date, 'YYYY-MM-DD') AS date,
         to_char(s.start_time, 'HH24:MI') AS "startTime",
         to_char(s.end_time, 'HH24:MI') AS "endTime",
         s.place, s.supplies, s.notes,
         s.gives_certificate AS "givesCertificate",
         s.cancelled_at AS "cancelledAt", s.cancel_reason AS "cancelReason",
         COUNT(ap.id) FILTER (WHERE ap.status = 'applied')::int AS "appliedCount"
  FROM schedules s
  JOIN activities a ON a.id = s.activity_id
  LEFT JOIN applications ap ON ap.schedule_id = s.id
`;

@Injectable()
export class SchedulesService {
  constructor(private readonly db: DatabaseService) {}

  /** 일정 목록. 주를 고르지 않으면 오늘부터의 일정을 보여 준다. */
  async list(filter: ScheduleFilter) {
    await this.db.ensureUpcomingSchedules();
    // 담당자가 지운(취소한) 일정은 목록에 보이지 않는다.
    const where: string[] = ['s.cancelled_at IS NULL'];
    const params: unknown[] = [];

    if (filter.week) {
      if (!isValidDate(filter.week)) {
        throw new BadRequestException('주는 2026-11-01처럼 그 주의 날짜로 적어 주세요.');
      }
      const { start, end } = weekRange(filter.week);
      params.push(start, end);
      where.push(`s.date BETWEEN $${params.length - 1} AND $${params.length}`);
    } else {
      params.push(todayKst());
      where.push(`s.date >= $${params.length}`);
    }

    if (filter.activityId) {
      if (!/^\d+$/.test(filter.activityId)) {
        throw new BadRequestException('활동 종류가 올바르지 않아요.');
      }
      params.push(Number(filter.activityId));
      where.push(`a.id = $${params.length}`);
    }

    // 신청 가능한 것만: 신청 마감(오늘·지난 날짜)이 아니고 자리가 남은 일정
    let having = '';
    if (filter.available === 'true') {
      params.push(todayKst());
      where.push(`s.date > $${params.length}`);
      having = `HAVING COUNT(ap.id) FILTER (WHERE ap.status = 'applied') < a.capacity`;
    }
    const rows = await this.db.query<ScheduleRow>(
      `${SCHEDULE_SELECT} WHERE ${where.join(' AND ')} GROUP BY s.id, a.id ${having} ORDER BY s.date, a.id`,
      params,
    );
    return rows.map((row) => this.withStatus(row));
  }

  /** 화면에서 고를 수 있는 주 목록과 주마다 신청 가능한 일정 수 */
  async weeks() {
    await this.db.ensureUpcomingSchedules();
    const today = todayKst();
    const weeks = await this.selectableWeeks();
    const counts = await this.db.query<{ weekStart: string; count: number }>(
      `SELECT to_char(s.date - EXTRACT(DOW FROM s.date)::int, 'YYYY-MM-DD') AS "weekStart", COUNT(*)::int AS count
       FROM schedules s JOIN activities a ON a.id = s.activity_id
       WHERE s.date > $1 AND s.cancelled_at IS NULL
         AND (SELECT COUNT(*) FROM applications ap WHERE ap.schedule_id = s.id AND ap.status = 'applied') < a.capacity
       GROUP BY 1`,
      [today],
    );
    return weeks.map((week) => ({
      ...week,
      availableCount: counts.find((c) => c.weekStart === week.start)?.count ?? 0,
    }));
  }

  /** 이번 주부터 마지막 일정이 있는 주까지 */
  async selectableWeeks() {
    const today = todayKst();
    const [{ last }] = await this.db.query<{ last: string | null }>(
      `SELECT to_char(MAX(date), 'YYYY-MM-DD') AS last FROM schedules WHERE date >= $1 AND cancelled_at IS NULL`,
      [today],
    );
    return selectableWeeks(today, last);
  }

  async findOne(id: number) {
    const rows = await this.db.query<ScheduleRow>(`${SCHEDULE_SELECT} WHERE s.id = $1 GROUP BY s.id, a.id`, [id]);
    if (rows.length === 0) {
      throw new NotFoundException('봉사 일정을 찾을 수 없어요.');
    }
    return this.withStatus(rows[0]);
  }

  async create(dto: CreateScheduleDto) {
    const activityName = await this.validate(dto);
    try {
      const rows = await this.db.query<{ id: number }>(
        `INSERT INTO schedules (activity_id, date, start_time, end_time, place, supplies, notes, gives_certificate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [dto.activityId, dto.date, dto.startTime, dto.endTime, dto.place, dto.supplies ?? '', dto.notes ?? '', dto.givesCertificate],
      );
      return this.findOne(rows[0].id);
    } catch (error) {
      throw duplicateError(error, activityName);
    }
  }

  /**
   * 일정 수정 (담당자). 규칙 R8:
   * 오늘이나 지난 일정은 고칠 수 없고, 신청자가 있으면 날짜와 활동은 바꿀 수 없다 (신청자의 주 2회·하루 한 번 규칙이 꼬이므로).
   */
  async update(id: number, dto: CreateScheduleDto) {
    const activityName = await this.validate(dto);
    await this.db.transaction(async (client) => {
      const current = await this.lockOpenSchedule(client, id);
      if (current.date <= todayKst()) {
        throw new BadRequestException('오늘이나 지난 일정은 고칠 수 없어요.');
      }
      if (current.appliedCount > 0 && (current.activityId !== dto.activityId || current.date !== dto.date)) {
        throw new BadRequestException(
          `신청자가 ${current.appliedCount}명 있어서 날짜와 활동은 바꿀 수 없어요. 시간·장소·준비물·주의사항만 고칠 수 있어요.`,
        );
      }
      try {
        await client.query(
          `UPDATE schedules SET activity_id = $2, date = $3, start_time = $4, end_time = $5,
                  place = $6, supplies = $7, notes = $8, gives_certificate = $9
           WHERE id = $1`,
          [id, dto.activityId, dto.date, dto.startTime, dto.endTime, dto.place, dto.supplies ?? '', dto.notes ?? '', dto.givesCertificate],
        );
      } catch (error) {
        throw duplicateError(error, activityName);
      }
    });
    return this.findOne(id);
  }

  /**
   * 일정 삭제 (담당자). 규칙 R9:
   * 신청자가 있으면 취소 사유를 꼭 적어야 하고, 그 신청도 함께 취소되며 봉사자는 내 신청 찾기에서 사유를 본다.
   * 담당자가 취소한 신청은 봉사자의 취소 횟수(R2)에 넣지 않는다. 기록은 지우지 않고 '취소됨'으로 남긴다.
   */
  cancel(id: number, dto: CancelScheduleDto) {
    return this.db.transaction(async (client) => {
      const current = await this.lockOpenSchedule(client, id);
      if (current.date < todayKst()) {
        throw new BadRequestException('이미 끝난 일정은 지울 수 없어요.');
      }
      const reason = dto.reason?.trim() || null;
      if (current.appliedCount > 0 && !reason) {
        throw new BadRequestException(
          `신청자가 ${current.appliedCount}명 있어요. 봉사자에게 보여 줄 취소 사유를 꼭 적어 주세요.`,
        );
      }
      await client.query('UPDATE schedules SET cancelled_at = now(), cancel_reason = $2 WHERE id = $1', [id, reason]);
      const cancelled = await client.query(
        `UPDATE applications SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'staff', cancel_reason = $2
         WHERE schedule_id = $1 AND status = 'applied'`,
        [id, reason],
      );
      const count = cancelled.rowCount ?? 0;
      return {
        id,
        cancelledApplications: count,
        message: count > 0 ? `일정을 지우고 신청 ${count}건을 함께 취소했어요.` : '일정을 지웠어요.',
      };
    });
  }

  /** 신청자 명단 (담당자). 담당자가 봉사자에게 연락할 수 있게 이름과 전화번호를 그대로 보여 준다. */
  async roster(id: number) {
    await this.findOne(id);
    return this.db.query(
      `SELECT ap.id, ap.status, ap.created_at AS "createdAt", ap.cancelled_at AS "cancelledAt",
              ap.cancelled_by AS "cancelledBy", ap.cancel_reason AS "cancelReason",
              v.name, v.phone, v.is_minor AS "isMinor"
       FROM applications ap JOIN volunteers v ON v.id = ap.volunteer_id
       WHERE ap.schedule_id = $1
       ORDER BY ap.status, ap.created_at`,
      [id],
    );
  }

  /** 등록·수정할 때 공통으로 확인하고, 활동 이름을 돌려준다. */
  private async validate(dto: CreateScheduleDto): Promise<string> {
    if (!isValidDate(dto.date)) {
      throw new BadRequestException('날짜는 2026-11-03처럼 올바른 날짜로 적어 주세요.');
    }
    if (dto.date < todayKst()) {
      throw new BadRequestException('지난 날짜에는 일정을 등록할 수 없어요.');
    }
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('끝나는 시간은 시작 시간보다 늦어야 해요.');
    }
    const activities = await this.db.query<{ name: string }>('SELECT name FROM activities WHERE id = $1', [dto.activityId]);
    if (activities.length === 0) {
      throw new BadRequestException('활동 종류를 다시 골라 주세요.');
    }
    return activities[0].name;
  }

  /** 지우지 않은 일정을 잠그고, 지금 신청 중인 인원과 함께 돌려준다. */
  private async lockOpenSchedule(client: PoolClient, id: number) {
    const rows = await client.query<{ activityId: number; date: string; cancelledAt: Date | null }>(
      `SELECT activity_id AS "activityId", to_char(date, 'YYYY-MM-DD') AS date, cancelled_at AS "cancelledAt"
       FROM schedules WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (rows.rowCount === 0) {
      throw new NotFoundException('봉사 일정을 찾을 수 없어요.');
    }
    if (rows.rows[0].cancelledAt) {
      throw new BadRequestException('이미 지운 일정이에요.');
    }
    const applied = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM applications WHERE schedule_id = $1 AND status = 'applied'`,
      [id],
    );
    return { ...rows.rows[0], appliedCount: applied.rows[0].count };
  }

  private withStatus(row: ScheduleRow) {
    const remaining = Math.max(0, row.capacity - row.appliedCount);
    const isPast = row.date <= todayKst();
    return {
      ...row,
      remaining,
      isPast,
      isCancelled: row.cancelledAt !== null,
      canApply: !isPast && remaining > 0 && row.cancelledAt === null,
      cancelDeadline: cancelDeadline(row.date),
      canCancelAfterApply: canCancelAt(row.date),
    };
  }
}

/** 같은 날 같은 활동이 이미 있으면 쉬운 안내로 바꾼다. */
function duplicateError(error: unknown, activityName: string): unknown {
  if ((error as { code?: string }).code === '23505') {
    return new ConflictException(`이 날짜에는 이미 ${activityName} 일정이 있어요.`);
  }
  return error;
}
