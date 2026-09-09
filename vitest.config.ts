import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Bound process and filesystem contention while exercising every test file.
    maxWorkers: 4,
  },
}))
