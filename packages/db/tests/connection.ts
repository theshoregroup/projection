const TEST_DATABASE_HOST = process.env.TEST_DATABASE_HOST ?? "127.0.0.1:54324";

export const TEST_DATABASE_NAME = "projection_test";
export const ADMIN_DATABASE_URL = `postgresql://postgres:password@${TEST_DATABASE_HOST}/postgres`;
export const TEST_DATABASE_URL = `postgresql://postgres:password@${TEST_DATABASE_HOST}/${TEST_DATABASE_NAME}`;
