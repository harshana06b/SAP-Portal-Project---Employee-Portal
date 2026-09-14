const axios = require('axios');
const path = require('node:path');
const leaveRequestDateStore = require('./leaveRequestDateStore');
const withdrawnLeaveStore = require('./withdrawnLeaveStore');

const SAP_URL = process.env.SAP_URL;
const SAP_SERVICE_PATH = process.env.SAP_SERVICE_PATH;
const SAP_USER = process.env.SAP_USER;
const SAP_PASSWORD = process.env.SAP_PASSWORD;
const SAP_CLIENT = process.env.SAP_CLIENT;
const SAP_TIMEOUT_MS = Number(process.env.SAP_TIMEOUT_MS || 30000);
const DEFAULT_SERVICE_PATH = '/sap/opu/odata/sap/ZEMPLOYEE_NEW_SRV/';
const SERVICE_NAME = 'ZEMPLOYEE_NEW_SRV';
const SEGW_PROJECT = 'ZEMPLOYEE_NEW';
const MPC_CLASS = 'ZCL_ZEMPLOYEE_NEW_MPC';
const DPC_EXT_CLASS = 'ZCL_ZEMPLOYEE_NEW_DPC_EXT';

const ENTITY_SETS = Object.freeze({
    login: 'EmpLoginSet',
    profile: 'EmpProfileSet',
    leaveData: 'LeaveDataNewSet',
    leaveBalance: 'LeaveBalanceNewSet',
    leaveRequest: 'LeaveRequestNewSet',
    leaveHistory: 'LeaveHistoryNewSet',
    payslip: 'PaySlipNewSet',
    payslipPdf: 'PaySlipPdfSet',
});

if (!SAP_URL || !SAP_USER || !SAP_PASSWORD) {
    throw new Error('Missing SAP environment variables. Please set SAP_URL, SAP_USER, and SAP_PASSWORD.');
}

const sapServicePath = SAP_SERVICE_PATH || DEFAULT_SERVICE_PATH;
const baseUrl = new URL(sapServicePath, SAP_URL).toString();

// Global cookie jar to maintain session across requests
let sessionCookies = '';

function getPernrVariants(pernr) {
    const raw = String(pernr).trim();
    const padded = raw.padStart(8, '0');
    return raw === padded ? [raw] : [raw, padded];
}

function escapeODataValue(value) {
    return String(value ?? '').replace(/'/g, "''");
}

function buildFilter(filters) {
    return Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([field, value]) => `${field} eq '${escapeODataValue(value)}'`)
        .join(' and ');
}

function buildFilteredPath(entitySet, filters) {
    const filter = buildFilter(filters);
    return filter ? `${entitySet}?$filter=${encodeURIComponent(filter)}` : entitySet;
}

function normalizePernr(pernr) {
    return String(pernr ?? '').trim().padStart(8, '0');
}

function isNetworkError(error) {
    return Boolean(error?.request && !error?.response);
}

function toArray(value) {
    return Array.isArray(value) ? value : [value].filter(Boolean);
}

function normalizeStatus(status) {
    const normalized = String(status || '').trim().toUpperCase();

    if (['APPROVED', 'POSTED', 'A'].includes(normalized)) {
        return 'APPROVED';
    }
    if (['REJECTED', 'R'].includes(normalized)) {
        return 'REJECTED';
    }
    if (['CANCELLED', 'CANCELED', 'C'].includes(normalized)) {
        return 'CANCELLED';
    }
    if (['SUBMITTED', 'PENDING', 'S', 'N'].includes(normalized)) {
        return 'SUBMITTED';
    }

    return normalized || 'SUBMITTED';
}

function parseSapDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();
    const sapMatch = raw.match(/^\/Date\((\d+)\)\/$/);
    if (sapMatch) {
        return new Date(Number(sapMatch[1]));
    }

    if (/^\d{8}$/.test(raw)) {
        const date = new Date(Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateMatch) {
        const date = new Date(Date.UTC(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const displayDateMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (displayDateMatch) {
        const date = new Date(Date.UTC(Number(displayDateMatch[3]), Number(displayDateMatch[2]) - 1, Number(displayDateMatch[1])));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatSapDate(value) {
    const date = parseSapDate(value);
    if (!date) {
        return value;
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatSapRequestDate(value) {
    const date = parseSapDate(value);
    if (!date) {
        return value;
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getRecordDate(record, keys) {
    for (const key of keys) {
        if (record[key]) {
            return parseSapDate(record[key]);
        }
    }

    return null;
}

function calculateDays(startDate, endDate) {
    const start = parseSapDate(startDate);
    const end = parseSapDate(endDate);

    if (!start || !end) {
        return 0;
    }

    return Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 0);
}

/**
 * Creates axios instance with SAP authentication and session management
 */
function createAxios(options = {}) {
    const { authUser, authPass, responseType, csrfToken, customHeaders } = options;

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...customHeaders,
    };

    // Add CSRF token if provided
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    // Add cookies if we have them
    const cookieHeader = sessionCookies ? { Cookie: sessionCookies } : {};

    return axios.create({
        baseURL: baseUrl,
        timeout: Number.isFinite(SAP_TIMEOUT_MS) && SAP_TIMEOUT_MS > 0 ? SAP_TIMEOUT_MS : 30000,
        responseType: responseType || 'json',
        auth: {
            username: authUser || SAP_USER,
            password: authPass || SAP_PASSWORD,
        },
        params: SAP_CLIENT ? { 'sap-client': SAP_CLIENT } : undefined,
        headers: {
            ...headers,
            ...cookieHeader,
        },
        // Important: Don't follow redirects automatically for SAP
        maxRedirects: 0,
        // Validate status to handle SAP's custom error codes
        validateStatus: function (status) {
            return status >= 200 && status < 600; // Accept all status codes for manual handling
        },
    });
}

/**
 * Updates session cookies from response headers
 */
function updateSessionCookies(response) {
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
        // Extract and store cookies (simplified - in production you might want a proper cookie jar)
        const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        sessionCookies = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        console.log('Updated session cookies:', sessionCookies);
    }
}

/**
 * Fetches CSRF token from SAP
 */
async function fetchCsrfToken() {
    console.log('Fetching CSRF token from SAP...');

    const client = createAxios({
        customHeaders: {
            'X-CSRF-Token': 'Fetch',
        },
    });

    try {
        const response = await client.get(''); // GET on service root to fetch token

        // Update cookies from response
        updateSessionCookies(response);

        // Extract CSRF token from headers
        const csrfToken = response.headers['x-csrf-token'] || response.headers['X-CSRF-Token'];

        if (!csrfToken) {
            throw new Error('CSRF token not found in SAP response headers');
        }

        console.log('CSRF token fetched successfully');
        return csrfToken;
    } catch (error) {
        console.error('Failed to fetch CSRF token:', error.message);
        throw new Error(`CSRF token fetch failed: ${error.message}`);
    }
}

/**
 * Unwraps OData response payload
 */
function unwrapODataResponse(response) {
    if (!response || !response.data) {
        return null;
    }

    const payload = response.data;

    // Handle OData v2 format
    if (payload.d) {
        return payload.d.results || payload.d;
    }

    // Handle plain JSON or value responses
    return payload.value || payload;
}

/**
 * Handles SAP error responses
 */
function handleSapError(error, operation) {
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        console.error(`${operation} failed with status ${status}:`, data);

        // Handle specific SAP error formats
        if (data && data.error) {
            const sapError = data.error;
            return {
                status,
                code: sapError.code,
                message: sapError.message?.value || sapError.message || 'SAP Error',
                details: sapError,
            };
        }

        return {
            status,
            message: data?.message || error.message || 'Unknown SAP error',
            details: data,
        };
    } else if (error.request) {
        console.error(`${operation} network error:`, error.message);
        return {
            status: 503,
            message: 'Network error - unable to reach SAP system',
            details: {
                url: error.config?.url,
                baseUrl: error.config?.baseURL,
                timeout: error.config?.timeout,
                code: error.code,
                address: error.address,
                port: error.port,
            },
        };
    } else {
        console.error(`${operation} error:`, error.message);
        return {
            status: 500,
            message: error.message || 'Internal error',
            details: error.toString(),
        };
    }
}

/**
 * Performs login with CSRF token handling
 */
async function postLogin(pernr, password) {
    console.log(`Attempting login for user: ${pernr}`);

    try {
        // Step 1: Fetch CSRF token
        const csrfToken = await fetchCsrfToken();

        // Step 2: Create client with CSRF token
        const client = createAxios({
            csrfToken,
            customHeaders: {
                'X-CSRF-Token': csrfToken,
            },
        });

        // Step 3: Perform login POST
        console.log('Sending login POST request...');
        const response = await client.post(ENTITY_SETS.login, { Pernr: pernr, Password: password });

        // Update cookies from login response
        updateSessionCookies(response);

        // Check response status
        if (response.status >= 400) {
            throw { response };
        }

        const result = unwrapODataResponse(response);
        console.log('Login successful');
        return result;

    } catch (error) {
        throw handleSapError(error, 'Login');
    }
}

/**
 * Fetches employee profile (GET - no CSRF needed)
 */
async function fetchEmployeeProfile(pernr) {
    const paddedPernr = pernr.toString().padStart(8, '0');
    console.log(`Fetching profile for employee: ${paddedPernr}`);

    const client = createAxios();

    try {
        const response = await client.get(`${ENTITY_SETS.profile}(Pernr='${escapeODataValue(paddedPernr)}')`);

        if (response.status >= 400) {
            throw { response };
        }

        const result = unwrapODataResponse(response);
        const entry = Array.isArray(result) ? result[0] : result;

        if (!entry) {
            return null;
        }

        const firstName = entry.FirstName || entry.VORNA || null;
        const lastName = entry.LastName || entry.NACHN || null;
        const fullName =
            entry.FullName ||
            entry.ENAME ||
            `${firstName || ''} ${lastName || ''}`.trim() ||
            null;

        return {
            pernr: entry.Pernr || pernr,
            firstName,
            lastName,
            fullName,
            position: entry.Designation || entry.PLANS || null,
            department: entry.Department || entry.ORGEH || null,
            location: entry.PersonnelArea || entry.BTRTL || null,
            companyCode: entry.CompanyCode || entry.Bukrs || null,
            employeeGroup: entry.EmployeeGroup || entry.Persg || null,
            employeeSubgroup: entry.EmployeeSubgroup || entry.Persk || null,
            raw: entry,
        };

    } catch (error) {
        throw handleSapError(error, 'Profile fetch');
    }
}

/**
 * Fetches leave data (GET - no CSRF needed)
 */
async function fetchLeaveData(pernr) {
    const paddedPernr = pernr.toString().padStart(8, '0');
    console.log(`Fetching leave data for employee: ${paddedPernr}`);

    const client = createAxios();

    try {
        const response = await client.get(buildFilteredPath(ENTITY_SETS.leaveData, { Pernr: paddedPernr }));

        if (response.status >= 400) {
            throw { response };
        }

        const results = unwrapODataResponse(response);
        return applyLeaveRecordOverrides(toArray(results).map(normalizeLeaveRecord));

    } catch (error) {
        throw handleSapError(error, 'Leave data fetch');
    }
}

async function fetchLeaveBalance(pernr) {
    const paddedPernr = pernr.toString().padStart(8, '0');
    const client = createAxios();

    try {
        const response = await client.get(buildFilteredPath(ENTITY_SETS.leaveBalance, { Pernr: paddedPernr }));

        if (response.status >= 400) {
            throw { response };
        }

        return applyLeaveRecordOverrides(toArray(unwrapODataResponse(response)).map(normalizeLeaveRecord));
    } catch (error) {
        throw handleSapError(error, 'Leave balance fetch');
    }
}

async function fetchLeaveHistory(pernr) {
    const paddedPernr = pernr.toString().padStart(8, '0');
    const client = createAxios();

    try {
        const response = await client.get(buildFilteredPath(ENTITY_SETS.leaveHistory, { Pernr: paddedPernr }));

        if (response.status >= 400) {
            throw { response };
        }

        return applyLeaveRecordOverrides(toArray(unwrapODataResponse(response)).map(normalizeLeaveRecord));
    } catch (error) {
        throw handleSapError(error, 'Leave history fetch');
    }
}

async function fetchLeaveRequests(pernr) {
    const paddedPernr = pernr ? normalizePernr(pernr) : null;
    const client = createAxios();

    try {
        const response = await client.get(buildFilteredPath(ENTITY_SETS.leaveRequest, { Pernr: paddedPernr }));

        if (response.status >= 400) {
            throw { response };
        }

        return applyLeaveRecordOverrides(toArray(unwrapODataResponse(response)).map(normalizeLeaveRecord));
    } catch (error) {
        throw handleSapError(error, 'Leave request fetch');
    }
}

async function createLeaveRequest(request) {
    const paddedPernr = normalizePernr(request.pernr);
    const startDate = formatSapRequestDate(request.startDate);
    const endDate = formatSapRequestDate(request.endDate);
    const days = Number(request.days || calculateDays(request.startDate, request.endDate));
    const payload = {
        Pernr: paddedPernr,
        Leavetype: request.leaveType,
        Begda: startDate,
        Endda: endDate,
        Noofdays: Number.isFinite(days) ? days : 0,
        Reason: request.reason || '',
        Status: 'SUBMITTED',
    };

    validateLeaveRequest(payload);
    const existingRequests = await fetchLeaveRequests(paddedPernr);
    assertNoOverlappingLeave(payload, existingRequests);

    const csrfToken = await fetchCsrfToken();
    const client = createAxios({ csrfToken });

    try {
        const response = await client.post(ENTITY_SETS.leaveRequest, payload);

        updateSessionCookies(response);

        if (response.status >= 400) {
            throw { response };
        }

        leaveRequestDateStore.markSubmitted(payload);

        return normalizeLeaveRecord({
            ...unwrapODataResponse(response),
            ...payload,
        });
    } catch (error) {
        throw handleSapError(error, 'Leave request creation');
    }
}

async function cancelLeaveRequest(pernr, requestId, reason) {
    const paddedPernr = pernr.toString().padStart(8, '0');
    const csrfToken = await fetchCsrfToken();
    const client = createAxios({ csrfToken });
    const payload = {
        Pernr: paddedPernr,
        RequestId: requestId,
        ReqId: requestId,
        Status: 'CANCELLED',
        CancelReason: reason || '',
    };

    try {
        const entityPath = `${ENTITY_SETS.leaveRequest}(Pernr='${escapeODataValue(paddedPernr)}',RequestId='${escapeODataValue(requestId)}')`;
        const response = await client.delete(entityPath);

        updateSessionCookies(response);

        if (response.status >= 400) {
            throw { response };
        }

        return normalizeLeaveRecord(unwrapODataResponse(response) || payload);
    } catch (error) {
        throw handleSapError(error, 'Leave request cancellation');
    }
}

async function withdrawLeaveRequest(request) {
    const paddedPernr = normalizePernr(request.pernr || request.Pernr);
    const leaveType = request.leaveType || request.Leavetype;
    const beginDate = formatSapRequestDate(request.beginDate || request.Begda);

    if (!paddedPernr || !leaveType || !beginDate) {
        throw {
            status: 400,
            message: 'Employee, leave type, and begin date are required to withdraw leave.',
        };
    }

    const csrfToken = await fetchCsrfToken();
    const client = createAxios({ csrfToken });

    try {
        const sapUrl =
            `${ENTITY_SETS.leaveRequest}(Pernr='${escapeODataValue(paddedPernr)}',` +
            `Leavetype='${escapeODataValue(leaveType)}',Begda='${escapeODataValue(beginDate)}')`;

        console.log('DELETE URL:', sapUrl);

        const response = await client.delete(sapUrl);

        updateSessionCookies(response);

        if (response.status >= 400) {
            console.error('Withdraw DELETE failed status:', response.status);
            console.error('Withdraw DELETE failed data:', response.data);
            throw { response };
        }

        withdrawnLeaveStore.markWithdrawn({
            pernr: paddedPernr,
            leaveType,
            beginDate,
        });

        return {
            Pernr: paddedPernr,
            Leavetype: leaveType,
            Begda: beginDate,
            Status: 'WITHDRAW REQUEST',
        };
    } catch (error) {
        console.error('Withdraw DELETE error status:', error.response?.status);
        console.error('Withdraw DELETE error data:', error.response?.data);
        throw handleSapError(error, 'Leave request withdrawal');
    }
}

async function fetchLeaveAnalytics(pernr) {
    const [leaveData, balance, history] = await Promise.all([
        fetchLeaveData(pernr),
        fetchLeaveBalance(pernr),
        fetchLeaveHistory(pernr),
    ]);
    const workflowRecords = history.length ? history : leaveData;
    const statusCounts = workflowRecords.reduce((accumulator, record) => {
        const status = normalizeStatus(record.Status || record.status);
        accumulator[status] = (accumulator[status] || 0) + 1;
        return accumulator;
    }, {});
    const usedDays = workflowRecords.reduce((sum, record) => sum + Number(record.NoOfDays || record.Used || record.Kverb || 0), 0);
    const balanceDays = balance.reduce((sum, record) => sum + Number(record.Balance || record.Remaining || record.BalanceLeave || 0), 0);

    return {
        service: {
            project: SEGW_PROJECT,
            serviceName: SERVICE_NAME,
            mpcClass: MPC_CLASS,
            dpcExtClass: DPC_EXT_CLASS,
            entitySets: ENTITY_SETS,
        },
        totals: {
            requests: workflowRecords.length,
            usedDays,
            balanceDays,
            submitted: statusCounts.SUBMITTED || 0,
            approved: statusCounts.APPROVED || 0,
            rejected: statusCounts.REJECTED || 0,
            cancelled: statusCounts.CANCELLED || 0,
        },
        byStatus: statusCounts,
        byType: groupLeaveByType(workflowRecords),
    };
}

function validateLeaveRequest(payload) {
    const start = parseSapDate(payload.Begda);
    const end = parseSapDate(payload.Endda);

    if (!payload.Pernr || !(payload.Leavetype || payload.Awart) || !start || !end || !Number.isInteger(payload.Noofdays)) {
        throw {
            status: 400,
            message: 'Employee, leave type, begin date, end date, and number of days are required.',
        };
    }

    if (start > end) {
        throw {
            status: 400,
            message: 'Leave start date cannot be after end date.',
        };
    }
}

function assertNoOverlappingLeave(payload, records) {
    const start = parseSapDate(payload.Begda);
    const end = parseSapDate(payload.Endda);
    const overlaps = records.some((record) => {
        const status = normalizeStatus(record.Status || record.status);
        if (status === 'REJECTED' || status === 'CANCELLED' || status === 'WITHDRAW REQUEST') {
            return false;
        }

        const recordStart = getRecordDate(record, ['Begda', 'FromDate', 'StartDate']);
        const recordEnd = getRecordDate(record, ['Endda', 'ToDate', 'EndDate']);
        return recordStart && recordEnd && start <= recordEnd && end >= recordStart;
    });

    if (overlaps) {
        throw {
            status: 409,
            message: 'The selected leave dates overlap with an existing active leave request.',
        };
    }
}

function normalizeLeaveRecord(record) {
    if (!record || typeof record !== 'object') {
        return record;
    }

    return {
        ...record,
        Status: normalizeStatus(record.Status || record.Stat2 || record.ApprovalStatus),
        LeaveType: record.Leavetype || record.LeaveType || record.Awart,
        LeaveTypeText: record.LeaveDesc || record.Leavedesc || record.LeaveTypeText || record.KTEXT || record.TypeText || record.Atext || record.Ltext,
        NoOfDays: Number(record.Noofdays ?? record.NoOfDays ?? record.Used ?? record.Kverb ?? 0),
    };
}

function applyLeaveRecordOverrides(records) {
    return withdrawnLeaveStore.applyWithdrawnStatuses(leaveRequestDateStore.applySubmittedDates(records));
}

function groupLeaveByType(records) {
    return records.reduce((accumulator, record) => {
        const type = record.LeaveDesc || record.Leavedesc || record.LeaveTypeText || record.KTEXT || record.Leavetype || record.LeaveType || record.Awart || 'Leave';
        accumulator[type] = (accumulator[type] || 0) + Number(record.NoOfDays || record.Used || record.Kverb || 0);
        return accumulator;
    }, {});
}

/**
 * Fetches payslip list (GET - no CSRF needed)
 */
async function fetchPaySlipList(pernr, filters = {}) {
    const client = createAxios();
    const pernrVariants = getPernrVariants(pernr);
    const payMonth = filters.payMonth || filters.PayMonth;
    const payYear = filters.payYear || filters.PayYear;
    let lastError;

    for (const candidatePernr of pernrVariants) {
        console.log(`Fetching payslip list for employee: ${candidatePernr}, month: ${payMonth || 'all'}, year: ${payYear || 'all'}`);

        try {
            const response = await client.get(buildFilteredPath(ENTITY_SETS.payslip, {
                Pernr: candidatePernr,
                PayMonth: payMonth,
                PayYear: payYear,
            }));

            if (response.status >= 400) {
                throw { response };
            }

            const results = unwrapODataResponse(response);
            const normalized = Array.isArray(results) ? results : [results].filter(Boolean);

            if (normalized.length > 0) {
                return normalized;
            }
        } catch (error) {
            lastError = error;
            if (isNetworkError(error)) {
                break;
            }
        }
    }

    if (lastError) {
        throw handleSapError(lastError, 'Payslip list fetch');
    }

    return [];
}

/**
 * Downloads payslip PDF using entity keys
 */
async function downloadPayslipPdf(pernr, payMonth, payYear) {
    const client = createAxios({
        responseType: 'arraybuffer',
        customHeaders: {
            Accept: 'application/pdf',
        },
    });
    const pernrVariants = getPernrVariants(pernr);
    let lastError;

    for (const candidatePernr of pernrVariants) {
        console.log(`Downloading payslip PDF for employee: ${candidatePernr}, period: ${payMonth}/${payYear}`);

        const entityKey = `${ENTITY_SETS.payslipPdf}(Pernr='${escapeODataValue(candidatePernr)}',PayMonth='${escapeODataValue(payMonth)}',PayYear='${escapeODataValue(payYear)}')/$value`;
        const absoluteUrl = new URL(entityKey, baseUrl).toString();
        console.log('PDF URL:', absoluteUrl);

        try {
            const response = await client.get(absoluteUrl);

            if (response.status >= 400) {
                throw { response };
            }

            return response.data;
        } catch (error) {
            lastError = error;
            if (isNetworkError(error)) {
                break;
            }
        }
    }

    if (lastError) {
        throw handleSapError(lastError, 'PDF download');
    }
}

/**
 * Downloads payslip PDF from direct URL (legacy support)
 */
async function downloadPayslipPdfFromUrl(valueUrl) {
    console.log('Downloading payslip PDF from direct URL...');
    const absoluteUrl = getAbsolutePdfUrl(valueUrl);
    if (!absoluteUrl) {
        throw new Error('A valid SAP `$value` URL is required for payslip download.');
    }

    const client = createAxios({
        responseType: 'arraybuffer',
        customHeaders: {
            Accept: 'application/pdf',
        },
    });

    try {
        const response = await client.get(absoluteUrl);

        if (response.status >= 400) {
            throw { response };
        }

        return response.data;

    } catch (error) {
        throw handleSapError(error, 'PDF download');
    }
}

/**
 * Gets absolute PDF URL
 */
function getAbsolutePdfUrl(valueUrl) {
    if (!valueUrl) {
        return null;
    }

    try {
        const parsed = new URL(valueUrl);
        return parsed.toString();
    } catch (error) {
        return new URL(valueUrl, baseUrl).toString();
    }
}

module.exports = {
    postLogin,
    fetchEmployeeProfile,
    fetchLeaveData,
    fetchLeaveBalance,
    fetchLeaveHistory,
    fetchLeaveRequests,
    createLeaveRequest,
    cancelLeaveRequest,
    withdrawLeaveRequest,
    fetchLeaveAnalytics,
    fetchPaySlipList,
    downloadPayslipPdf,
    downloadPayslipPdfFromUrl,
    fetchCsrfToken, // Export for testing/debugging
};
