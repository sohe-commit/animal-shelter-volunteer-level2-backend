import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service.js';
import { canCancelAt, cancelDeadline, isValidDate, todayKst } from '../rules.js';
import type { CreateScheduleDto } from './schedules.dto.js';

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
}

export interface ScheduleFilter {
  date?: string;
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
         COUNT(ap.id) FILTER (WHERE ap.status = 'applied')::int AS "appliedCount"
  FROM schedules s
  JOIN activities a ON a.id = s.activity_id
  LEFT JOIN applications ap ON ap.schedule_id = s.id
`;

@Injectable()
export class SchedulesService {
  constructor(private readonly db: DatabaseService) {}

  /** 일정 목록. 날짜를 고르지 않으면 오늘부터의 일정을 보여 준다. */
  async list(filter: ScheduleFilter) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.date) {
      if (!isValidDate(filter.date)) {
        throw new BadRequestException('날짜는 2026-11-03처럼 적어 주세요.');
      }
      params.push(filter.date);
      where.push(`s.date = $${params.length}`);
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

  async findOne(id: number) {
    const rows = await this.db.query<ScheduleRow>(`${SCHEDULE_SELECT} WHERE s.id = $1 GROUP BY s.id, a.id`, [id]);
    if (rows.length === 0) {
      throw new NotFoundException('봉사 일정을 찾을 수 없어요.');
    }
    return this.withStatus(rows[0]);
  }

  async create(dto: CreateScheduleDto) {
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

    try {
      const rows = await this.db.query<{ id: number }>(
        `INSERT INTO schedules (activity_id, date, start_time, end_time, place, supplies, notes, gives_certificate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [dto.activityId, dto.date, dto.startTime, dto.endTime, dto.place, dto.supplies ?? '', dto.notes ?? '', dto.givesCertificate],
      );
      return this.findOne(rows[0].id);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(`이 날짜에는 이미 ${activities[0].name} 일정이 있어요.`);
      }
      throw error;
    }
  }

  private withStatus(row: ScheduleRow) {
    const remaining = Math.max(0, row.capacity - row.appliedCount);
    const isPast = row.date <= todayKst();
    return {
      ...row,
      remaining,
      isPast,
      canApply: !isPast && remaining > 0,
      cancelDeadline: cancelDeadline(row.date),
      canCancelAfterApply: canCancelAt(row.date),
    };
  }
}
