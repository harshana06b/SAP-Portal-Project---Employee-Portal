const fs = require('node:fs');
const path = require('node:path');

const storePath = path.join(__dirname, '..', 'data', 'leave-request-dates.json');

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

    const plainDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (plainDateMatch) {
        return new Date(Date.UTC(Number(plainDateMatch[1]), Number(plainDateMatch[2]) - 1, Number(plainDateMatch[3])));
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

function normalizeLeaveType(value) {
    return String(value ?? '').trim().toUpperCase();
}

function normalizeReason(value) {
    return String(value ?? '').trim().toUpperCase();
}

function normalizeDays(value) {
    const days = Number(value ?? 0);
    return Number.isFinite(days) ? Number(days.toFixed(2)) : 0;
}

function readStore() {
    try {
        if (!fs.existsSync(storePath)) {
            return [];
        }

        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Failed to read leave request date store:', error.message);
        return [];
    }
}

function writeStore(records) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, `${JSON.stringify(records, null, 2)}\n`);
}

function submittedRecordKey(record) {
    return [
        normalizePernr(record.Pernr || record.pernr),
        normalizeLeaveType(record.Leavetype || record.LeaveType || record.Awart || record.leaveTypeCode),
        normalizeDate(record.Begda || record.FromDate || record.StartDate || record.startDate),
        normalizeDate(record.Endda || record.ToDate || record.EndDate || record.endDate),
        normalizeDays(record.Noofdays ?? record.NoOfDays ?? record.used),
        normalizeReason(record.Reason || record.reason),
    ].join('|');
}

function fallbackMatch(left, right) {
    return normalizePernr(left.Pernr || left.pernr) === normalizePernr(right.pernr) &&
        normalizeLeaveType(left.Leavetype || left.LeaveType || left.Awart || left.leaveTypeCode) === normalizeLeaveType(right.leaveType) &&
        normalizeDays(left.Noofdays ?? left.NoOfDays ?? left.used) === normalizeDays(right.noOfDays) &&
        normalizeReason(left.Reason || left.reason) === normalizeReason(right.reason);
}

function markSubmitted(payload) {
    const records = readStore();
    const entry = {
        pernr: normalizePernr(payload.Pernr || payload.pernr),
        leaveType: String(payload.Leavetype || payload.leaveType || '').trim(),
        beginDate: normalizeDate(payload.Begda || payload.beginDate),
        endDate: normalizeDate(payload.Endda || payload.endDate),
        noOfDays: normalizeDays(payload.Noofdays ?? payload.NoOfDays ?? payload.days),
        reason: String(payload.Reason || payload.reason || '').trim(),
        updatedAt: new Date().toISOString(),
    };
    const key = submittedRecordKey({
        Pernr: entry.pernr,
        Leavetype: entry.leaveType,
        Begda: entry.beginDate,
        Endda: entry.endDate,
        Noofdays: entry.noOfDays,
        Reason: entry.reason,
    });
    const nextRecords = records.filter((record) => submittedRecordKey({
        Pernr: record.pernr,
        Leavetype: record.leaveType,
        Begda: record.beginDate,
        Endda: record.endDate,
        Noofdays: record.noOfDays,
        Reason: record.reason,
    }) !== key);

    nextRecords.push(entry);
    writeStore(nextRecords);
    return entry;
}

function applySubmittedDate(record) {
    const match = readStore().find((entry) => submittedRecordKey(record) === submittedRecordKey({
        Pernr: entry.pernr,
        Leavetype: entry.leaveType,
        Begda: entry.beginDate,
        Endda: entry.endDate,
        Noofdays: entry.noOfDays,
        Reason: entry.reason,
    }) || fallbackMatch(record, entry));

    if (!match) {
        return record;
    }

    return {
        ...record,
        Begda: match.beginDate,
        FromDate: match.beginDate,
        StartDate: match.beginDate,
        Endda: match.endDate,
        ToDate: match.endDate,
        EndDate: match.endDate,
    };
}

function applySubmittedDates(records) {
    return records.map(applySubmittedDate);
}

module.exports = {
    applySubmittedDates,
    markSubmitted,
};
