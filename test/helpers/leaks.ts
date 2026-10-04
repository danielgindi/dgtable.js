interface ListenerRecord {
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject | null;
    capture: boolean;
}

const trackedTargets: EventTarget[] = [document, window];
const originalAdd = EventTarget.prototype.addEventListener;
const originalRemove = EventTarget.prototype.removeEventListener;
let records: ListenerRecord[] = [];
let tracking = false;

function isCapture(options?: boolean | EventListenerOptions): boolean {
    return typeof options === 'boolean' ? options : !!options?.capture;
}

function matches(record: ListenerRecord, target: EventTarget, type: string, listener: unknown, capture: boolean): boolean {
    return record.target === target && record.type === type && record.listener === listener && record.capture === capture;
}

EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    const capture = isCapture(options);
    const isOnce = typeof options === 'object' && !!options?.once;

    if (tracking && listener && !isOnce && trackedTargets.includes(this) &&
        !records.some(r => matches(r, this, type, listener, capture)))
        records.push({ target: this, type, listener, capture });

    return originalAdd.call(this, type, listener, options);
};

EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const capture = isCapture(options);
    records = records.filter(r => !matches(r, this, type, listener, capture));
    return originalRemove.call(this, type, listener, options);
};

export function startListenerTracking(): void {
    records = [];
    tracking = true;
}

export function stopListenerTracking(): { document: string[]; window: string[] } {
    tracking = false;
    const result = {
        document: records.filter(r => r.target === document).map(r => r.type),
        window: records.filter(r => r.target === window).map(r => r.type),
    };
    records = [];
    return result;
}
