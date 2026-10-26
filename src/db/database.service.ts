import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { SCHEMA_SQL } from './schema.js';
import { seedDemoData, type SeedResult } from './seed.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL이 없습니다. backend/.env 파일을 확인해 주세요.');
    }
    this.pool = new pg.Pool({
      connectionString,
      // Render의 PostgreSQL은 보안 연결(SSL)이 필요하다. 내 컴퓨터의 DB를 쓸 때만 DATABASE_SSL=false로 끈다.
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }

  /** 서버가 켜질 때 테이블을 만들고, 비어 있으면 가상 데이터를 채운다. */
  async onModuleInit() {
    await this.pool.query(SCHEMA_SQL);
    const { rows } = await this.pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM activities');
    if (rows[0].count === 0) {
      const result = await this.transaction((client) => seedDemoData(client));
      this.logger.log(`가상 데이터를 채웠습니다: ${JSON.stringify(result)}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  /** 트랜잭션 밖에서 PoolClient처럼 쓸 때 */
  get pooled(): Pick<PoolClient, 'query'> {
    return this.pool;
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** 모든 데이터를 지우고 가상 데이터를 다시 채운다. */
  resetDemoData(): Promise<SeedResult> {
    return this.transaction(async (client) => {
      await client.query('TRUNCATE applications, volunteers, schedules, activities RESTART IDENTITY CASCADE');
      return seedDemoData(client);
    });
  }
}
