export const TEST_DB_NAME = 'homepulse_test';

/** Server-level connection used to (re)create the test database. */
export function adminUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres';
}

/** Connection to the test database itself. */
export function testDbUrl(): string {
  const url = new URL(adminUrl());
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}
