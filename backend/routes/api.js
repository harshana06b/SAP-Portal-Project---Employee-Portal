const express = require('express');
const {
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
} = require('../controllers/portalController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.get('/profile/:id', verifyToken, getProfile);
router.get('/leave/requests', verifyToken, getLeaveRequests);
router.delete('/leave/:pernr/:leaveType/:begda', verifyToken, withdrawLeaveRequest);
router.get('/leave/:id', verifyToken, getLeave);
router.get('/leave/:id/balance', verifyToken, getLeaveBalance);
router.get('/leave/:id/history', verifyToken, getLeaveHistory);
router.get('/leave/:id/requests', verifyToken, getLeaveRequests);
router.get('/leave/:id/analytics', verifyToken, getLeaveAnalytics);
router.post('/leave/request', verifyToken, createLeaveRequest);
router.post('/leave/request/withdraw', verifyToken, withdrawLeaveRequest);
router.post('/leave/:id/request/:requestId/cancel', verifyToken, cancelLeaveRequest);
router.get('/payslip/download', verifyToken, downloadPayslip);
router.post('/payslip/mail', verifyToken, mailPayslip);
router.get('/payslip/:id', verifyToken, getPayslip);

module.exports = router;
