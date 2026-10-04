import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';

// Run after `npm run build` (see the `test:dist` script).

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const bundles = ['lib.es6.js', 'lib.es6.min.js', 'lib.cjs.cjs', 'lib.cjs.min.cjs', 'lib.umd.js', 'lib.umd.min.js'];

describe('published package', () => {
    it('PKG-01 (D17): contains only the build output, the sources, README, LICENSE and package.json', () => {
        // HUSKY=0: `npm pack` runs the `prepare` script even with --ignore-scripts.
        const output = execSync('npm pack --dry-run --json --ignore-scripts', {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, HUSKY: '0' },
        });
        // Lifecycle scripts may print to stdout before the JSON payload.
        const [{ files }] = JSON.parse(output.slice(output.indexOf('[')));
        // src/ is published on purpose: the source maps point into it.
        const allowed = [/^dist\//, /^src\//, /^README\.md$/, /^LICENSE$/, /^package\.json$/];
        const unexpected = files
            .map((file: { path: string }) => file.path)
            .filter((path: string) => !allowed.some(pattern => pattern.test(path)));

        expect(unexpected).toEqual([]);
    });

    it.each(bundles)('DIST-01 (D9): %s carries the package version', bundle => {
        const code = readFileSync(join(root, 'dist', bundle), 'utf8');
        expect(code).not.toContain('@@VERSION');
        expect(code).toContain(pkg.version);
    });

    describe('CommonJS bundle', () => {
        beforeAll(() => {
            const window = new Window();
            const globals = globalThis as Record<string, unknown>;
            globals.window = window;
            for (const key of ['document', 'Element', 'HTMLElement', 'Node', 'DocumentFragment', 'getComputedStyle', 'MouseEvent', 'Event']) {
                const value = (window as unknown as Record<string, unknown>)[key];
                globals[key] = typeof value === 'function' && key === 'getComputedStyle' ? value.bind(window) : value;
            }
        });

        it('DIST-04: package.json points require() at the CommonJS bundle', () => {
            expect(pkg.main).toBe('dist/lib.cjs.min.cjs');
            expect(pkg.exports['.'].require).toBe('./dist/lib.cjs.min.cjs');
        });

        it.each(['lib.cjs.cjs', 'lib.cjs.min.cjs'])('DIST-04: require(%s) returns the constructor', bundle => {
            const require = createRequire(import.meta.url);

            // @danielgindi/virtual-list-helper ships its CommonJS entry as .js in a "type": "module"
            // package, so it cannot be require()d yet (see the next test). Stand in for it.
            const helperPath = require.resolve('@danielgindi/virtual-list-helper');
            require.cache[helperPath] = { id: helperPath, filename: helperPath, loaded: true, exports: class {} } as never;

            try {
                const DGTable = require(join(root, 'dist', bundle));
                expect(typeof DGTable).toBe('function');
                expect(DGTable.VERSION).toBe(pkg.version);
                const table = new DGTable({ columns: [{ name: 'a' }] });
                expect(table.el.className).toBe('dgtable-wrapper');
                table.destroy();
            } finally {
                delete require.cache[helperPath];
            }
        });

        // External: flips to passing once @danielgindi/virtual-list-helper ships a .cjs entry.
        it.fails('DIST-04 (external): @danielgindi/virtual-list-helper can be require()d', () => {
            const require = createRequire(import.meta.url);
            expect(() => require('@danielgindi/virtual-list-helper')).not.toThrow();
        });
    });
});
