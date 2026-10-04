#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/eb36058c1d73c0588bde2f8d95c384f379d61ea86d158871718a258907175f5a/contract';
import endContract from '../../snapshots/eb36058c1d73c0588bde2f8d95c384f379d61ea86d158871718a258907175f5a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fe5b9d7df0c2743a25060bdc81250bca7455822e9774e6a0febb7b91c53fb9d4/contract';
import startContract from '../../snapshots/fe5b9d7df0c2743a25060bdc81250bca7455822e9774e6a0febb7b91c53fb9d4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'deployment',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('imageTag', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('jenkinsBuildNo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('projectId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('publicUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'project',
        columns: [
          col('branch', 'text', {
            notNull: true,
            default: lit('main'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('buildCommand', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('installCommand', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('port', 'int4', {
            notNull: true,
            default: lit(3000),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('repoUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('runtime', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('runtimeVersion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('startCommand', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'deployment',
        index: 'deployment_projectId_idx_a96e4d92',
        columns: ['projectId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'project',
        index: 'project_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'deployment',
        foreignKey: {
          name: 'deployment_projectId_fkey',
          columns: ['projectId'],
          references: { schema: 'public', table: 'project', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'project',
        foreignKey: {
          name: 'project_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
