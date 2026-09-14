export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PortalUser {
  pernr: string;
  status?: string;
  fullName?: string;
}

export interface AuthSession {
  token: string;
  user: PortalUser;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface Profile {
  pernr: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  position?: string | null;
  department?: string | null;
  location?: string | null;
  companyCode?: string | null;
  employeeGroup?: string | null;
  employeeSubgroup?: string | null;
  raw?: Record<string, unknown>;
}

export interface LeaveRecord {
  id: string;
  pernr: string;
  employeeName?: string | null;
  type: string;
  leaveTypeCode?: string | null;
  leaveTypeText?: string | null;
  status: string;
  total: number;
  used: number;
  balance: number;
  startDate?: string;
  endDate?: string;
  payrollDays?: number;
  calendarDays?: number;
  department?: string | null;
  position?: string | null;
  companyCode?: string | null;
  location?: string | null;
  createdOn?: string;
  requestId?: string | null;
  reason?: string | null;
  raw: Record<string, unknown>;
}

export interface LeaveSummary {
  total: number;
  used: number;
  balance: number;
}

export interface LeaveRequestPayload {
  pernr: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days?: number;
  reason?: string;
}

export interface LeaveWithdrawPayload {
  pernr: string;
  leaveType: string;
  beginDate: string;
}

export interface LeaveAnalytics {
  service?: {
    project: string;
    serviceName: string;
    mpcClass: string;
    dpcExtClass: string;
    entitySets: Record<string, string>;
  };
  totals: {
    requests: number;
    usedDays: number;
    balanceDays: number;
    submitted: number;
    approved: number;
    rejected: number;
    cancelled: number;
  };
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

export interface PayslipRecord {
  id: string;
  pernr: string;
  payMonth: string;
  payYear: string;
  wageType: string;
  wageText?: string | null;
  employeeName?: string | null;
  designation?: string | null;
  department?: string | null;
  grossPay?: number;
  totalDeductions?: number;
  netPay?: number;
  bankAccount?: string | null;
  bankKey?: string | null;
  currency?: string | null;
  status?: string | null;
  label: string;
  amount: number;
  billingDate?: string;
  dueDate?: string;
  valueUrl?: string;
  raw: Record<string, unknown>;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}
