import { defineConfig } from 'vitest/config';

// 全量并行(84 文件/409 用例)下,做真实 DB/esbuild/子进程的集成用例在 5s 默认超时边缘抖动
// (本地与 CI 失败集合会漂移,单跑全过)。统一给 30s 余量:只消除负载敏感假失败,
// 真实挂起仍会在 30s 失败;不放宽任何断言。
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
