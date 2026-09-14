const sapService = require('../services/sapService');
const mailService = require('../services/mailService');
const { setPdfHeaders } = require('../utils/pdfUtil');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kaar-employee-portal-dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

async function login(req, res, next) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required',
                data: null,
            });
        }

        console.log(`Login attempt for user: ${username}`);
        const loginResult = await sapService.postLogin(username, password);

        console.log('SAP Login Result:', loginResult);
        //console.log('SAP Login Result Keys:', Object.keys(loginResult));

        if (!loginResult) {
            return res.status(401).json({
                success: false,
                message: 'Authentication failed - no response',
                data: null,
            });
        }

        // Successful login - the SAP service doesn't throw errors for successful logins
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token: jwt.sign({ pernr: username }, JWT_SECRET, {
                    expiresIn: JWT_EXPIRES_IN,
                }),
                user: {
                    pernr: username,
                    status: 'OK',
                },
                sapResponse: loginResult,
            },
        });

    } catch (error) {
        console.error('Login error:', error);

        // Handle structured SAP errors
        if (error.status && error.message) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: {
                    code: error.code,
                    details: error.details,
                },
            });
        }

        // Fallback for unexpected errors
        res.status(500).json({
            success: false,
            message: 'Internal server error during login',
            data: { error: error.message },
        });
    }
}

async function getProfile(req, res, next) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
                data: null,
            });
        }

        console.log(`Fetching profile for employee: ${id}`);
        const profile = await sapService.fetchEmployeeProfile(id);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Employee profile not found',
                data: { pernr: id },
            });
        }

        res.json({
            success: true,
            message: 'Profile retrieved successfully',
            data: profile,
        });

    } catch (error) {
        console.error('Profile fetch error:', error);

        if (error.status && error.message) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: {
                    pernr: req.params.id,
                    code: error.code,
                    details: error.details,
                },
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching profile',
            data: { error: error.message },
        });
    }
}

async function getLeave(req, res, next) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
                data: null,
            });
        }

        console.log(`Fetching leave data for employee: ${id}`);
        const leaveData = await sapService.fetchLeaveData(id);

        res.json({
            success: true,
            message: 'Leave data retrieved successfully',
            data: {
                pernr: id,
                leaveRecords: leaveData,
                count: leaveData.length,
            },
        });

    } catch (error) {
        console.error('Leave data fetch error:', error);

        if (error.status && error.message) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: {
                    pernr: req.params.id,
                    code: error.code,
                    details: error.details,
                },
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching leave data',
            data: { error: error.message },
        });
    }
}

async function getLeaveBalance(req, res, next) {
    try {
        const { id } = req.params;
        const balance = await sapService.fetchLeaveBalance(id);

        res.json({
            success: true,
            message: 'Leave balance retrieved successfully',
            data: {
                pernr: id,
                balances: balance,
                count: balance.length,
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while fetching leave balance', { pernr: req.params.id });
    }
}

async function getLeaveHistory(req, res, next) {
    try {
        const { id } = req.params;
        const history = await sapService.fetchLeaveHistory(id);

        res.json({
            success: true,
            message: 'Leave history retrieved successfully',
            data: {
                pernr: id,
                history,
                count: history.length,
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while fetching leave history', { pernr: req.params.id });
    }
}

async function getLeaveRequests(req, res, next) {
    try {
        const id = req.params.id || req.query.pernr || null;
        const requests = await sapService.fetchLeaveRequests(id);

        res.json({
            success: true,
            message: 'Leave requests retrieved successfully',
            data: {
                pernr: id,
                requests,
                count: requests.length,
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while fetching leave requests', { pernr: req.params.id });
    }
}

async function createLeaveRequest(req, res, next) {
    try {
        const created = await sapService.createLeaveRequest(req.body);

        res.status(201).json({
            success: true,
            message: 'Leave request submitted successfully',
            data: created,
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while submitting leave request');
    }
}

async function cancelLeaveRequest(req, res, next) {
    try {
        const { id, requestId } = req.params;
        const cancelled = await sapService.cancelLeaveRequest(id, requestId, req.body?.reason);

        res.json({
            success: true,
            message: 'Leave request cancelled successfully',
            data: cancelled,
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while cancelling leave request', {
            pernr: req.params.id,
            requestId: req.params.requestId,
        });
    }
}

async function withdrawLeaveRequest(req, res, next) {
    try {
        const withdrawn = await sapService.withdrawLeaveRequest({
            pernr: req.params.pernr || req.body?.pernr || req.body?.Pernr,
            leaveType: req.params.leaveType || req.body?.leaveType || req.body?.Leavetype,
            beginDate: req.params.begda || req.body?.beginDate || req.body?.Begda,
        });

        res.json({
            success: true,
            message: 'Leave withdrawn successfully',
            data: withdrawn,
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while withdrawing leave request', {
            pernr: req.params.pernr || req.body?.pernr || req.body?.Pernr,
            leaveType: req.params.leaveType || req.body?.leaveType || req.body?.Leavetype,
            beginDate: req.params.begda || req.body?.beginDate || req.body?.Begda,
        });
    }
}

async function getLeaveAnalytics(req, res, next) {
    try {
        const { id } = req.params;
        const analytics = await sapService.fetchLeaveAnalytics(id);

        res.json({
            success: true,
            message: 'Leave analytics retrieved successfully',
            data: analytics,
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while fetching leave analytics', { pernr: req.params.id });
    }
}

async function getPayslip(req, res, next) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
                data: null,
            });
        }

        const { payMonth, payYear } = req.query;

        console.log(`Fetching payslip list for employee: ${id}`);
        const payslipData = await sapService.fetchPaySlipList(id, { payMonth, payYear });

        res.json({
            success: true,
            message: 'Payslip list retrieved successfully',
            data: {
                pernr: id,
                payslips: payslipData,
                count: payslipData.length,
            },
        });

    } catch (error) {
        console.error('Payslip fetch error:', error);

        if (error.status && error.message) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: {
                    pernr: req.params.id,
                    code: error.code,
                    details: error.details,
                },
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching payslip data',
            data: { error: error.message },
        });
    }
}

async function downloadPayslip(req, res, next) {
    try {
        const { url, pernr, payMonth, payYear, disposition } = req.query;

        if (!url && !(pernr && payMonth && payYear)) {
            return res.status(400).json({
                success: false,
                message: 'Payslip URL or Pernr, PayMonth, and PayYear are required',
                data: null,
            });
        }

        console.log('Downloading payslip PDF...');
        const pdfBuffer = url
            ? await sapService.downloadPayslipPdfFromUrl(url)
            : await sapService.downloadPayslipPdf(pernr, payMonth, payYear);

        const fileName = `payslip-${pernr}-${payYear}-${payMonth}.pdf`;
        setPdfHeaders(res, fileName, disposition === 'inline' ? 'inline' : 'attachment');
        return res.status(200).send(Buffer.from(pdfBuffer));

    } catch (error) {
        console.error('PDF download error:', error);

        if (error.status && error.message) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: {
                    code: error.code,
                    details: error.details,
                },
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error while downloading PDF',
            data: { error: error.message },
        });
    }
}

async function mailPayslip(req, res, next) {
    try {
        const { url, pernr, payMonth, payYear, wageType, employeeName } = req.body || {};

        if (!url && !(pernr && payMonth && payYear)) {
            return res.status(400).json({
                success: false,
                message: 'Payslip URL or Pernr, PayMonth, and PayYear are required',
                data: null,
            });
        }

        const pdfBuffer = url
            ? await sapService.downloadPayslipPdfFromUrl(url)
            : await sapService.downloadPayslipPdf(pernr, payMonth, payYear);
        const fileName = `payslip-${pernr || 'employee'}-${payYear || 'year'}-${payMonth || 'month'}-${wageType || 'pay'}.pdf`;

        const info = await mailService.sendPayslipMail({
            pdfBuffer,
            fileName,
            statement: { pernr, payMonth, payYear, wageType, employeeName },
        });

        res.json({
            success: true,
            message: 'Payslip mailed successfully',
            data: {
                messageId: info.messageId,
                to: process.env.PAYSLIP_MAIL_TO || 'bharshana06@gmail.com',
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'Internal server error while mailing payslip');
    }
}

function handleControllerError(res, error, fallbackMessage, data = {}) {
    console.error(fallbackMessage, error);

    if (error.status && error.message) {
        return res.status(error.status).json({
            success: false,
            message: error.message,
            data: {
                ...data,
                code: error.code,
                details: error.details,
            },
        });
    }

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
        data: { ...data, error: error.message },
    });
}

module.exports = {
    login,
    getProfile,
    getLeave,
    getLeaveBalance,
    getLeaveHistory,
    getLeaveRequests,
    createLeaveRequest,
    cancelLeaveRequest,
    withdrawLeaveRequest,
    getLeaveAnalytics,
    getPayslip,
    downloadPayslip,
    mailPayslip,
};
