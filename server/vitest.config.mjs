import { defineConfig } from 'vitest/config';

// All API tests share one real database, so run test files one at a time
export default defineConfig({
  test: { fileParallelism: false },
});