import { describe, expect, it } from 'vitest';
import { mountTable } from '../helpers/table';
import { rowTexts } from '../helpers/dom';

const workerSource = `
self.onmessage = () => {
    self.postMessage({ rows: [{ id: 3 }, { id: 1 }] });
    self.postMessage({ append: true, rows: [{ id: 2 }] });
};
`;

function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
    const start = performance.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            if (condition())
                return resolve();
            if (performance.now() - start > timeout)
                return reject(new Error('timed out'));
            setTimeout(check, 20);
        };
        check();
    });
}

describe('web workers', () => {
    it('WRK-01: reports worker support', () => {
        const { table } = mountTable({});
        expect(table.isWorkerSupported()).toBe(true);
    });

    it('WRK-02: creates blob URLs from element content', async () => {
        const { table } = mountTable({});
        const script = document.createElement('script');
        script.type = 'text/x-worker';
        script.id = 'worker-src';
        script.textContent = workerSource;
        document.head.appendChild(script);

        try {
            const url = table.getUrlForElementContent('worker-src')!;
            expect(url).toMatch(/^blob:/);
            expect(await (await fetch(url)).text()).toBe(workerSource);
            expect(table.getUrlForElementContent('missing')).toBeNull();
        } finally {
            script.remove();
        }
    });

    it('WRK-03: loads and appends rows from a worker, re-sorting when asked', async () => {
        const { table } = mountTable({ columns: [{ name: 'id' }] });
        table.sort('id');
        const url = URL.createObjectURL(new Blob([workerSource]));

        const worker = table.createWebWorker(url, true, true)!;
        await waitFor(() => table.getRowCount() === 3);
        expect(rowTexts(table, 'id')).toEqual(['1', '2', '3']);
        worker.terminate();
    });

    it('WRK-03: start=false does not post the start message', async () => {
        const { table } = mountTable({ columns: [{ name: 'id' }] });
        const url = URL.createObjectURL(new Blob([workerSource]));

        const worker = table.createWebWorker(url, false)!;
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(table.getRowCount()).toBe(0);

        worker.postMessage(null);
        await waitFor(() => table.getRowCount() === 3);
        expect(rowTexts(table, 'id')).toEqual(['3', '1', '2']);
        worker.terminate();
    });

    it('WRK-04: unbindWebWorker stops updates', async () => {
        const { table } = mountTable({ columns: [{ name: 'id' }] });
        const url = URL.createObjectURL(new Blob([workerSource]));

        const worker = table.createWebWorker(url, false)!;
        table.unbindWebWorker(worker);
        worker.postMessage(null);
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(table.getRowCount()).toBe(0);
        worker.terminate();
    });
});
