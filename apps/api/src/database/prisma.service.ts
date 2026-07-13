import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Injectable Prisma client (≈ a Spring DataSource / EntityManager bean).
 *
 * Prisma 7 uses the Rust-free Query Compiler, so the client connects through a
 * driver adapter. We use @prisma/adapter-pg (node-postgres over TCP), which
 * behaves identically for Neon today and AWS RDS later — the only thing that
 * changes between them is DATABASE_URL.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('database.url');
    // node-postgres pools 10 connections by default, which starves at the start
    // of an exam when a whole batch of candidates hits "Start" together
    // (§2.17: 50–200 concurrent). Size it via DATABASE_POOL_MAX.
    const max = configService.get<number>('database.poolMax') ?? 25;
    super({ adapter: new PrismaPg({ connectionString, max }) });
  }

  async onModuleInit(): Promise<void> {
    // Fail fast: if the DB is unreachable, the app should not accept traffic.
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    // Runs on SIGTERM/SIGINT because main.ts calls enableShutdownHooks().
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
