/**
 * Test harness that talks to Postgres the way PostgREST does: every call runs in its own
 * transaction as the `authenticated` role with the user's JWT claims set. RLS applies exactly
 * as it would for the mobile app — the tests cannot cheat past policies.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { testDbUrl } from './config';

// Return timestamps/dates as strings so assertions are explicit about time zones.
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz
pg.types.setTypeParser(1082, (v) => v); // date

export const pool = new pg.Pool({ connectionString: testDbUrl(), max: 10 });

export type Args = Record<string, unknown>;

/** Runs SQL as the superuser (test setup only: time travel, inspecting private state). */
export async function admin<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

function buildCall(fn: string, args: Args) {
  const keys = Object.keys(args);
  const params = keys.map((k) => {
    const v = args[k];
    // Plain objects and arrays of objects are jsonb; arrays of scalars are Postgres arrays.
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
    if (Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object')) return JSON.stringify(v);
    return v;
  });
  const named = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  return { named, params };
}

export class Actor {
  constructor(
    public readonly id: string | null,
    public readonly name: string,
  ) {}

  /** Runs `fn` inside a transaction as this actor (anon if id is null). */
  async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      if (this.id) {
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: this.id, role: 'authenticated' }),
        ]);
        await client.query('set local role authenticated');
      } else {
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'anon' })]);
        await client.query('set local role anon');
      }
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Calls a scalar-returning RPC: `select public.fn(p_x => ...)`. */
  async rpc<T = unknown>(fn: string, args: Args = {}): Promise<T> {
    const { named, params } = buildCall(fn, args);
    return this.tx(async (c) => {
      const res = await c.query(`select public.${fn}(${named}) as result`, params);
      return res.rows[0]?.result as T;
    });
  }

  /** Calls a set-returning RPC: `select * from public.fn(...)`. */
  async rpcRows<T extends pg.QueryResultRow = pg.QueryResultRow>(fn: string, args: Args = {}): Promise<T[]> {
    const { named, params } = buildCall(fn, args);
    return this.tx(async (c) => (await c.query<T>(`select * from public.${fn}(${named})`, params)).rows);
  }

  /** Runs arbitrary SQL as this actor (RLS applies). */
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.tx(async (c) => (await c.query<T>(sql, params)).rows);
  }
}

export const anon = new Actor(null, 'anon');

/** Creates an auth user (profile + settings are created by the signup trigger). */
export async function createUser(name: string): Promise<Actor> {
  const id = randomUUID();
  await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${name.toLowerCase()}-${id.slice(0, 8)}@test.local`,
    JSON.stringify({ display_name: name }),
  ]);
  return new Actor(id, name);
}

export interface House {
  id: string;
  code: string;
  owner: Actor;
  members: Actor[];
  spaces: Record<string, string>;
}

/** Creates a household owned by the first user; everyone else joins with the invite code. */
export async function createHouse(
  names: string[],
  opts: { spaces?: { name: string; kind: string }[]; timeZone?: string } = {},
): Promise<House> {
  const members = await Promise.all(names.map((n) => createUser(n)));
  const owner = members[0];
  const id = await owner.rpc<string>('create_household', {
    p_name: `${names[0]}'s place`,
    p_time_zone: opts.timeZone ?? 'America/New_York',
    p_spaces: opts.spaces ?? [
      { name: 'Living room', kind: 'living' },
      { name: 'Kitchen', kind: 'kitchen' },
    ],
  });
  const invite = await owner.rpc<{ code: string }>('get_or_create_invite', { p_household: id });
  for (const m of members.slice(1)) {
    const res = await m.rpc<{ ok: boolean; error?: string }>('join_household', { p_code: invite.code });
    if (!res.ok) throw new Error(`join failed: ${res.error}`);
  }
  const spaceRows = await admin<{ id: string; name: string }>(`select id, name from public.spaces where household_id = $1`, [id]);
  const spaces = Object.fromEntries(spaceRows.map((s) => [s.name, s.id]));
  return { id, code: invite.code, owner, members, spaces };
}

/** ISO timestamp `minutes` from now. */
export function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function notificationsFor(actor: Actor) {
  return admin<{ title: string; category: string; actionable: boolean; push: boolean; signal_id: string | null }>(
    `select title, category, actionable, push, signal_id from public.notifications where user_id = $1 order by created_at`,
    [actor.id],
  );
}

/** Asserts a promise rejects with a Postgres error whose message matches `code`. */
export async function expectError(promise: Promise<unknown>, code: string | RegExp) {
  try {
    await promise;
  } catch (err) {
    const message = (err as Error).message;
    const ok = typeof code === 'string' ? message.includes(code) : code.test(message);
    if (!ok) throw new Error(`Expected error matching ${code}, got: ${message}`);
    return;
  }
  throw new Error(`Expected error matching ${code}, but the call succeeded`);
}
