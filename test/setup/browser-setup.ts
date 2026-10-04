import '../helpers/leaks';
import '../fixtures/test.css';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { cleanupTables } from '../helpers/table';
import { startListenerTracking, stopListenerTracking } from '../helpers/leaks';

let bodyChildCount = 0;

beforeEach(() => {
    startListenerTracking();
    bodyChildCount = document.body.children.length;
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanupTables();

    // INV-5: measurement wrappers must never be left behind in <body>.
    expect(document.body.children.length, 'leftover elements in <body>').toBe(bodyChildCount);

    // INV-5: every document/window listener a table added must be gone after destroy().
    expect(stopListenerTracking(), 'leaked document/window listeners').toEqual({ document: [], window: [] });
});
