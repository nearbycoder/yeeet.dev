import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import {
  applyMigrations,
  appliedMigrations,
  planMigrations,
} from '../src/migrations.js'

test('applies migrations in numeric order, once each', () => {
  const db = new Database(':memory:')
  const migrations = [
    { name: '10_c.sql', sql: 'INSERT INTO log VALUES (10);' },
    { name: '2_b.sql', sql: 'INSERT INTO log VALUES (2);' },
    { name: '1_a.sql', sql: 'CREATE TABLE log (n INTEGER);' },
  ]
  expect(applyMigrations(db, migrations).applied).toEqual([
    '1_a.sql',
    '2_b.sql',
    '10_c.sql',
  ])
  expect(applyMigrations(db, migrations).applied).toEqual([])
  expect(db.query('SELECT n FROM log').all()).toEqual([{ n: 2 }, { n: 10 }])
  expect(appliedMigrations(db).map((row) => row.name)).toEqual([
    '1_a.sql',
    '2_b.sql',
    '10_c.sql',
  ])
})

test('a failing migration rolls back completely and stops later ones', () => {
  const db = new Database(':memory:')
  expect(() =>
    applyMigrations(db, [
      { name: '1_a.sql', sql: 'CREATE TABLE a (id INTEGER);' },
      {
        name: '2_b.sql',
        sql: 'CREATE TABLE b (id INTEGER); INSERT INTO missing VALUES (1);',
      },
      { name: '3_c.sql', sql: 'CREATE TABLE c (id INTEGER);' },
    ]),
  ).toThrow('2_b.sql failed')
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name)
  expect(tables).toEqual(['_yeeet_migrations', 'a'])
})

test('plans report edited, unknown, and out-of-order migrations', () => {
  const db = new Database(':memory:')
  applyMigrations(db, [
    { name: '1_a.sql', sql: 'CREATE TABLE a (id INTEGER);' },
    { name: '3_c.sql', sql: 'CREATE TABLE c (id INTEGER);' },
  ])
  const plan = planMigrations(db, [
    { name: '1_a.sql', sql: 'CREATE TABLE a (id INTEGER, extra TEXT);' },
    { name: '2_b.sql', sql: 'CREATE TABLE b (id INTEGER);' },
  ])
  expect(plan.changed).toEqual(['1_a.sql'])
  expect(plan.unknown).toEqual(['3_c.sql'])
  expect(plan.pending.map((m) => m.name)).toEqual(['2_b.sql'])
  expect(plan.warnings.length).toBe(2)
  expect(() =>
    applyMigrations(db, [
      { name: '1_a.sql', sql: 'CREATE TABLE a (id INTEGER, extra TEXT);' },
    ]),
  ).toThrow('changed after it was applied')
})
