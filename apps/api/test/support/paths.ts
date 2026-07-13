import path from 'node:path';

/** Port the API suite boots the app on (override with API_TEST_PORT). */
export const API_PORT = Number(process.env.API_TEST_PORT ?? 3099);

export const TMP_DIR = path.resolve(__dirname, '../.tmp');
export const API_LOG_FILE = path.join(TMP_DIR, 'api.log');
export const API_PID_FILE = path.join(TMP_DIR, 'api.pid');

export const BASE_URL = `http://127.0.0.1:${API_PORT}`;
export const V1 = `${BASE_URL}/api/v1`;
