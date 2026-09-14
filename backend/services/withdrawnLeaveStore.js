const fs = require('node:fs');
const path = require('node:path');

const storePath = path.join(__dirname, '..', 'data', 'withdrawn-leave-requests.json');

function normalizePernr(pernr) {
    return String(pernr ?? '').trim().padStart(8, '0');
}

function parseDate(value) {
    if (!value) {
        return null;
    }

    const text = String(value).trim();
    const odataMatch = text.match(/^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/);
    if (odataMatch) {
        const date = new Date(Number(odataMatch[1]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (/^\d{8}$/.test(text)) {
        return new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value) {
    const date = parseDate(value);
    if (!date) {
        return String(value ?? '').trim();
    }

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

function buildKey(pernr, leaveType, beginDate) {
    return [
        normalizePernr(pernr),
        String(leaveType ?? '').trim().toUpperCase(),
        normalizeDate(beginDate),
    ].join('|');
}

function readStore() {
    try {
        if (!fs.existsSync(storePath)) {
            return {};
        }

        return JSON.parse(fs.readFileSync(storePath, 'utf8'));
    } catch (error) {
        console.error('Failed to read withdrawn leave store:', error.message);
        return {};
    }
}

function writeStore(store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function markWithdrawn({ pernr, leaveType, beginDate }) {
    const key = buildKey(pernr, leaveType, beginDate);
    const store = readStore();

    store[key] = {
        pernr: normalizePernr(pernr),
        leaveType: String(leaveType ?? '').trim(),
        beginDate: normalizeDate(beginDate),
        status: 'WITHDRAW REQUEST',
        updatedAt: new Date().toISOString(),
    };

    writeStore(store);
    return store[key];
}

function isWithdrawn({ pernr, leaveType, beginDate }) {
    return Boolean(readStore()[buildKey(pernr, leaveType, beginDate)]);
}

function applyWithdrawnStatus(record) {
    const pernr = record.Pernr || record.pernr;
    const leaveType = record.Leavetype || record.LeaveType || record.Awart || record.leaveTypeCode;
    const beginDate = record.Begda || record.FromDate || record.StartDate || record.startDate;

    if (!pernr || !leaveType || !beginDate || !isWithdrawn({ pernr, leaveType, beginDate })) {
        return record;
    }

    return {
        ...record,
        Status: 'WITHDRAW REQUEST',
        status: 'WITHDRAW REQUEST',
    };
}

function applyWithdrawnStatuses(records) {
    return records.map(applyWithdrawnStatus);
}

module.exports = {
    applyWithdrawnStatuses,
    markWithdrawn,
};
