import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

type BrowserName = 'chromium' | 'firefox' | 'webkit';

// TEST_BROWSERS=chromium,firefox limits the engines (defaults to all three).
const browsers = (process.env.TEST_BROWSERS || 'chromium,firefox,webkit')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean) as BrowserName[];

// The table's layout logic depends on real scrollbar widths (scrollbar compensation), and
// Playwright hides scrollbars in headless Chromium by default. Firefox may still use overlay
// scrollbars (e.g. on Windows 11); the tests that need a scrollbar gutter skip themselves there.
const launchOptions = {
    ignoreDefaultArgs: ['--hide-scrollbars'],
};

const browserBase = {
    enabled: true,
    headless: true,
    viewport: { width: 1280, height: 800 },
};

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['test/unit/**/*.test.ts'],
                },
            },
            {
                test: {
                    name: 'browser',
                    include: ['test/browser/**/*.test.ts'],
                    setupFiles: ['test/setup/browser-setup.ts'],
                    browser: {
                        ...browserBase,
                        provider: playwright({ launchOptions }),
                        instances: browsers.map(browser => ({ browser })),
                    },
                },
            },
            {
                test: {
                    name: 'package',
                    environment: 'node',
                    include: ['test/package/**/*.test.ts'],
                    testTimeout: 60_000,
                },
            },
            {
                test: {
                    name: 'dist',
                    include: ['test/dist/**/*.test.ts'],
                    browser: {
                        ...browserBase,
                        provider: playwright(),
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
            {
                test: {
                    name: 'perf',
                    include: ['test/perf/**/*.test.ts'],
                    setupFiles: ['test/setup/browser-setup.ts'],
                    testTimeout: 120_000,
                    browser: {
                        ...browserBase,
                        provider: playwright({
                            launchOptions: { ...launchOptions, args: ['--js-flags=--expose-gc'] },
                        }),
                        instances: [{ browser: 'chromium' }],
                    },
                },
            },
            {
                test: {
                    name: 'types',
                    include: [],
                    typecheck: {
                        enabled: true,
                        only: true,
                        include: ['test/types/**/*.test-d.ts'],
                        tsconfig: 'test/tsconfig.json',
                    },
                },
            },
        ],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            thresholds: { lines: 90, functions: 90, branches: 80 },
        },
    },
});
