import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '..');

function findBrowserExecutable() {
    const candidates = [
        process.env.CHROME_PATH,
        process.env.EDGE_PATH,
    ];

    if (process.platform === 'win32') {
        candidates.push(
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        );
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        );
    } else {
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
        );
    }

    for (const candidate of candidates) {
        if (candidate && existsSync(candidate))
            return candidate;
    }

    const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which';
    for (const command of ['google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge']) {
        const lookup = spawnSync(lookupCommand, [command], { encoding: 'utf8' });
        if (lookup.status === 0)
            return lookup.stdout.trim().split(/\r?\n/, 1)[0];
    }

    return null;
}

function listen(server) {
    return new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', resolveListen);
    });
}

function close(server) {
    return new Promise(resolveClose => {
        server.close(resolveClose);
    });
}

test('first end-sticky column covers the scrollbar gutter in LTR and RTL', { timeout: 15000 }, async t => {
    const browserExecutable = findBrowserExecutable();
    assert.ok(browserExecutable, 'Chrome or Edge is required; set CHROME_PATH or EDGE_PATH');

    let resolveResult;
    let rejectResult;
    let resultReceived = false;
    const resultPromise = new Promise((resolvePromise, rejectPromise) => {
        resolveResult = resolvePromise;
        rejectResult = rejectPromise;
    });
    const resultTimeout = setTimeout(() => {
        rejectResult(new Error('Browser did not report results within 10 seconds'));
    }, 10000);

    const allowedFiles = new Map([
        ['/fixture', 'test/fixtures/sticky_scrollbar.html'],
        ['/example/example.css', 'example/example.css'],
        ['/example/example_box_sizing.css', 'example/example_box_sizing.css'],
        ['/dist/lib.umd.js', 'dist/lib.umd.js'],
        ['/node_modules/@danielgindi/dom-utils/dist/lib.umd.js', 'node_modules/@danielgindi/dom-utils/dist/lib.umd.js'],
        ['/node_modules/@danielgindi/virtual-list-helper/dist/virtual-list-helper.umd.js', 'node_modules/@danielgindi/virtual-list-helper/dist/virtual-list-helper.umd.js'],
    ]);

    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url, 'http://127.0.0.1');
            if (request.method === 'POST' && requestUrl.pathname === '/__result') {
                const chunks = [];
                for await (const chunk of request)
                    chunks.push(chunk);

                resultReceived = true;
                resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                response.writeHead(204);
                response.end();
                return;
            }

            const relativePath = allowedFiles.get(requestUrl.pathname);
            if (!relativePath) {
                response.writeHead(404);
                response.end();
                return;
            }

            const content = await readFile(join(repositoryRoot, relativePath));
            const contentType = relativePath.endsWith('.css')
                ? 'text/css'
                : relativePath.endsWith('.js')
                    ? 'text/javascript'
                    : 'text/html';
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content);
        } catch (error) {
            rejectResult(error);
            response.writeHead(500);
            response.end();
        }
    });

    await listen(server);

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const browserProfile = await mkdtemp(join(tmpdir(), 'dgtable-sticky-test-'));
    const browser = spawn(browserExecutable, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--user-data-dir=' + browserProfile,
        'http://127.0.0.1:' + address.port + '/fixture',
    ], {
        stdio: 'ignore',
    });

    browser.once('error', rejectResult);
    browser.once('exit', code => {
        if (!resultReceived)
            rejectResult(new Error('Browser exited before reporting results with code ' + code));
    });

    try {
        const result = await resultPromise;
        const { moves, singleMoves, ...layouts } = result;
        for (const move of singleMoves) {
            await t.test(move.direction + ' dragging the only end-sticky column into the middle', () => {
                assert.ok(move.scrollbarWidth > 0, 'fixture must have a vertical scrollbar');
                // The physical last body column already has the scrollbar width deducted.
                assert.equal(move.beforeDragWidth, move.beforeDragBodyWidth + move.scrollbarWidth, 'drag must start with a compensated header');
                assert.equal(move.headerWidth, move.bodyWidth, 'moved header must match the body when not pinned');
                assert.equal(move.startDifference, 0, 'moved header start must align');
                assert.equal(move.endDifference, 0, 'moved header end must align');
            });
            await t.test(move.direction + ' resizing into the pinned position without scrolling', () => {
                assert.equal(move.pinnedWidth, 40 + move.scrollbarWidth, 'pinned header must cover the gutter');
            });
            await t.test(move.direction + ' scrolling through partial compensation and back', () => {
                const fullWidth = 40 + move.scrollbarWidth;
                const partial = move.transition.filter(sample => sample.headerWidth > 40 && sample.headerWidth < fullWidth);
                assert.ok(partial.length > 0, 'must exercise the partially compensated transition');
                assert.equal(move.transition[0].headerWidth, fullWidth, 'transition must begin pinned');
                assert.equal(move.transition.at(-1).headerWidth, 40, 'transition must end uncompensated');
                for (const sample of move.transition) {
                    const compensation = sample.headerWidth - 40;
                    assert.equal(sample.bodyWidth, 40, 'body width must not change');
                    assert.ok(compensation >= 0 && compensation <= move.scrollbarWidth, 'compensation must stay within the gutter');
                    assert.equal(sample.startDifference, 0, 'header start must stay aligned with the body');
                    if (compensation < move.scrollbarWidth) {
                        assert.equal(sample.margin + compensation, 0, 'margin must cancel partial width in normal flow');
                        assert.equal(sample.followingDifference, 0, 'following header must remain aligned');
                    }
                }
                assert.equal(move.scrolledWidth, 40, 'scrolling away must remove compensation');
                assert.equal(move.repinnedWidth, fullWidth, 'returning to the edge must restore compensation');
                assert.equal(move.returned.headerWidth, fullWidth, 'compensation must not accumulate after the transition');
                assert.equal(move.returned.margin, 0, 'returning to full compensation must clear the partial margin');
            });
        }
        for (const [direction, actual] of Object.entries(layouts)) {
            await t.test(direction + ' layout', () => {
                const columnWidth = direction.endsWith('Resized') ? 140 : 120;
                assert.ok(actual.scrollbarWidth > 0, 'fixture must have a vertical scrollbar');
                assert.equal(actual.firstHeaderEdge, '0px', 'header must stick to the end edge');
                assert.equal(actual.firstRowEdge, '100px', 'row offset must stay unchanged');
                assert.equal(actual.firstHeaderWidth, columnWidth + actual.scrollbarWidth, 'header must cover the scrollbar gutter');
                assert.equal(actual.firstRowWidth, columnWidth, 'row width must stay unchanged');
                assert.equal(actual.secondHeaderWidth, 100, 'second end-sticky header width must stay unchanged');
                assert.equal(actual.secondRowWidth, 100, 'second end-sticky row width must stay unchanged');
                assert.equal(actual.secondHeaderEdge, actual.scrollbarWidth + 'px', 'earlier header offset must stay unchanged');
                assert.equal(actual.secondRowEdge, '0px', 'earlier row offset must stay unchanged');
            });
        }
        for (const move of moves) {
            await t.test(move.direction + ' reordering end-stickies, virtual=' + move.virtualTable, () => {
                const expected = [120, 100 + move.scrollbarWidth];
                assert.deepEqual(move.afterDrop, expected, 'compensation must transfer after dragging');
                assert.deepEqual(move.rowOrder, ['first', 'firstEnd', 'secondEnd', 'last'], 'body must keep the moved order');
                assert.deepEqual(move.afterLayout, expected, 'compensation must stay correct after layout');
            });
        }
    } finally {
        clearTimeout(resultTimeout);
        if (browser.exitCode === null && browser.signalCode === null) {
            const browserExited = once(browser, 'exit');
            browser.kill();
            await browserExited;
        }
        server.closeAllConnections();
        await close(server);
        await rm(browserProfile, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 100,
        });
    }
});
