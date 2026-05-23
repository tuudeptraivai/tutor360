import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
  plugins: [
    // SWC required to support NestJS decorators / metadata in tests.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
