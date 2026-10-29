import { defineConfig } from 'vitest/config';

// All API tests share one real database, so run test files one at a time.
// Tests never send real mail or SMS.
export default defineConfig({
  test: { fileParallelism: false, env: { MAIL_MODE: 'preview', SMS_PROVIDER: 'stub' } },
});