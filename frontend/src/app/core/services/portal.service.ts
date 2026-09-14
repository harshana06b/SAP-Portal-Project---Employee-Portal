import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  AuthSession,
  LeaveAnalytics,
  LeaveRecord,
  LeaveRequestPayload,
  LeaveSummary,
  LeaveWithdrawPayload,
  LoginPayload,
  PayslipRecord,
  Profile,
} from '../models/portal.models';

type JsonObject = Record<string, unknown>;

type ODataResponse<T> = {
  d?: T | { results?: T[] };
};

@Injectable({ providedIn: 'root' })
export class PortalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly jsonOptions = {
    headers: new HttpHeaders({ Accept: 'application/json' }),
    params: new HttpParams().set('$format', 'json'),
  };

  login(payload: LoginPayload) {
    return this.http
      .post<ApiResponse<{ token: string; user: AuthSession['user'] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/login`,
        payload,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.readSingle(response) as { token: string; user: AuthSession['user'] }),
      );
  }

  private readonly profileCache = new Map<string, Profile>();
  private readonly profileRequests = new Map<string, Observable<Profile>>();

  getProfile(pernr: string) {
    const paddedPernr = pernr.toString().padStart(8, '0');

    if (this.profileCache.has(paddedPernr)) {
      return of(this.profileCache.get(paddedPernr)!);
    }

    if (this.profileRequests.has(paddedPernr)) {
      return this.profileRequests.get(paddedPernr)!;
    }

    const request$ = this.http
      .get<ApiResponse<JsonObject> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/profile/${paddedPernr}`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.mapProfile(this.readSingle(response))),
        tap((profile) => {
          this.profileCache.set(paddedPernr, profile);
          this.profileRequests.delete(paddedPernr);
        }),
        catchError((error) => {
          this.profileRequests.delete(paddedPernr);
          throw error;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    this.profileRequests.set(paddedPernr, request$);
    return request$;
  }

  getLeave(pernr: string) {
    const paddedPernr = this.normalizePernr(pernr);

    return this.http
      .get<ApiResponse<{ leaveRecords: JsonObject[] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/${paddedPernr}`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) =>
          this.readEntitySet(response, 'leaveRecords')
            .map((record) => this.mapLeaveRecord(record))
            .filter((record) => this.matchesPernr(record.pernr, paddedPernr)),
        ),
      );
  }

  getLeaveBalance(pernr: string) {
    const paddedPernr = this.normalizePernr(pernr);

    return this.http
      .get<ApiResponse<{ balances: JsonObject[] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/${paddedPernr}/balance`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) =>
          this.readEntitySet(response, 'balances')
            .map((record) => this.mapLeaveRecord(record))
            .filter((record) => this.matchesPernr(record.pernr, paddedPernr)),
        ),
      );
  }

  getLeaveHistory(pernr: string) {
    const paddedPernr = this.normalizePernr(pernr);

    return this.http
      .get<ApiResponse<{ history: JsonObject[] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/${paddedPernr}/history`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) =>
          this.readEntitySet(response, 'history')
            .map((record) => this.mapLeaveRecord(record))
            .filter((record) => this.matchesPernr(record.pernr, paddedPernr)),
        ),
      );
  }

  getLeaveRequests(pernr?: string) {
    const paddedPernr = pernr ? this.normalizePernr(pernr) : undefined;
    const options = paddedPernr
      ? {
          ...this.jsonOptions,
          params: this.jsonOptions.params
            .set('pernr', paddedPernr)
            .set('$filter', `Pernr eq '${paddedPernr}'`),
        }
      : this.jsonOptions;

    return this.http
      .get<ApiResponse<{ requests: JsonObject[] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/requests`,
        options,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => {
          const records = this.readEntitySet(response, 'requests').map((record) => this.mapLeaveRecord(record));
          return paddedPernr ? records.filter((record) => this.matchesPernr(record.pernr, paddedPernr)) : records;
        }),
      );
  }

  getLeaveAnalytics(pernr: string) {
    return this.http
      .get<ApiResponse<LeaveAnalytics> | ODataResponse<LeaveAnalytics>>(
        `${this.apiUrl}/leave/${pernr}/analytics`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.readSingle(response) as LeaveAnalytics),
      );
  }

  createLeaveRequest(payload: LeaveRequestPayload) {
    return this.http
      .post<ApiResponse<JsonObject> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/request`,
        payload,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.mapLeaveRecord(this.readSingle(response))),
      );
  }

  cancelLeaveRequest(pernr: string, requestId: string, reason?: string) {
    const paddedPernr = this.normalizePernr(pernr);

    return this.http
      .post<ApiResponse<JsonObject> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/${paddedPernr}/request/${requestId}/cancel`,
        { reason },
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.mapLeaveRecord(this.readSingle(response))),
      );
  }

  withdrawLeaveRequest(payload: LeaveWithdrawPayload) {
    const pernr = encodeURIComponent(payload.pernr);
    const leaveType = encodeURIComponent(payload.leaveType);
    const beginDate = encodeURIComponent(payload.beginDate);

    return this.http
      .delete<ApiResponse<JsonObject> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/leave/${pernr}/${leaveType}/${beginDate}`,
        this.jsonOptions,
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.mapLeaveRecord(this.readSingle(response))),
      );
  }

  getLeaveSummary(records: LeaveRecord[]): LeaveSummary {
    return records.reduce(
      (summary, record) => ({
        total: summary.total + record.total,
        used: summary.used + record.used,
        balance: summary.balance + record.balance,
      }),
      { total: 0, used: 0, balance: 0 },
    );
  }

  getPayslips(pernr: string, filters: { payMonth?: string; payYear?: string } = {}) {
    let params = this.jsonOptions.params;
    if (filters.payMonth && filters.payMonth !== 'all') {
      params = params.set('payMonth', filters.payMonth);
    }
    if (filters.payYear && filters.payYear !== 'all') {
      params = params.set('payYear', filters.payYear);
    }

    return this.http
      .get<ApiResponse<{ payslips: JsonObject[] }> | ODataResponse<JsonObject>>(
        `${this.apiUrl}/payslip/${pernr}`,
        { ...this.jsonOptions, params },
      )
      .pipe(
        tap((response) => console.log(response)),
        map((response) => this.readEntitySet(response, 'payslips').map((record) => this.mapPayslipRecord(record))),
      );
  }

  downloadPayslip(record: PayslipRecord, disposition: 'attachment' | 'inline' = 'attachment') {
    const params = new HttpParams()
      .set('pernr', record.pernr)
      .set('payMonth', record.payMonth)
      .set('payYear', record.payYear)
      .set('disposition', disposition);

    return this.http.get(`${this.apiUrl}/payslip/download`, {
      params,
      responseType: 'blob',
    });
  }

  mailPayslip(record: PayslipRecord) {
    const payload = {
      pernr: record.pernr,
      payMonth: record.payMonth,
      payYear: record.payYear,
      wageType: record.wageType,
      employeeName: record.employeeName,
    };

    return this.http.post<ApiResponse<{ messageId: string; to: string }>>(
      `${this.apiUrl}/payslip/mail`,
      payload,
      this.jsonOptions,
    );
  }

  private readSingle<T>(response: ApiResponse<T> | ODataResponse<T>): T {
    if (this.isApiResponse(response)) {
      return response.data;
    }

    const data = response.d;
    if (data && typeof data === 'object' && 'results' in data) {
      const results = (data as { results?: T[] }).results ?? [];
      return results[0] as T;
    }

    return data as T;
  }

  private readEntitySet(
    response: ApiResponse<Record<string, JsonObject[]>> | ODataResponse<JsonObject>,
    backendKey: string,
  ): JsonObject[] {
    if (this.isApiResponse(response)) {
      return response.data[backendKey] ?? [];
    }

    const data = response.d;
    if (data && typeof data === 'object' && 'results' in data) {
      return (data as { results?: JsonObject[] }).results ?? [];
    }

    return data ? [data as JsonObject] : [];
  }

  private isApiResponse<T>(response: ApiResponse<T> | ODataResponse<T>): response is ApiResponse<T> {
    return 'data' in response;
  }

  private mapProfile(record: JsonObject): Profile {
    const rawProfile = this.readNested(record, 'raw');
    const profileSource =
      rawProfile && typeof rawProfile === 'object' ? ({ ...rawProfile, ...record } as JsonObject) : record;

    const firstName = this.readProfileString(profileSource, ['firstName', 'FirstName']);
    const lastName = this.readProfileString(profileSource, ['lastName', 'LastName']);
    const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const fullName =
      this.readProfileString(profileSource, ['fullName', 'FullName']) ?? (combinedName || undefined);
    const department = this.readProfileString(profileSource, ['department', 'Department', 'OrgehText', 'Orgeh']);
    const position = this.readProfileString(profileSource, ['position', 'Designation', 'PlansText', 'Position']);

    return {
      pernr:
        this.readProfileString(profileSource, ['pernr', 'Pernr', 'PERNR']) ??
        this.readString(profileSource, ['PersonnelNumber']) ??
        '',
      firstName,
      lastName,
      fullName,
      department: department === '00000000' ? undefined : department,
      position: position === '99999999' ? undefined : position,
      location: this.readProfileString(profileSource, ['location', 'PersonnelArea', 'WerksText']),
      companyCode: this.readProfileString(profileSource, ['companyCode', 'CompanyCode', 'Bukrs']),
      employeeGroup: this.readProfileString(profileSource, ['employeeGroup', 'EmployeeGroup', 'Persg']),
      employeeSubgroup: this.readProfileString(profileSource, ['employeeSubgroup', 'EmployeeSubgroup', 'Persk']),
      raw: profileSource,
    };
  }

  private mapLeaveRecord(record: JsonObject): LeaveRecord {
    const rawLeave = this.readNested(record, 'raw');
    const leaveSource =
      rawLeave && typeof rawLeave === 'object' ? ({ ...rawLeave, ...record } as JsonObject) : record;
    const leaveTypeCode =
      this.readString(leaveSource, ['Leavetype', 'LeaveType', 'AbsType', 'QuotaType', 'Awart', 'Type', 'Subty']) ??
      'Leave';
    const leaveTypeText =
      this.readString(leaveSource, [
        'LeaveDesc',
        'Leavedesc',
        'TypeName',
        'QuotaName',
        'LeaveTypeText',
        'KTEXT',
        'TypeText',
        'Atext',
        'Ltext',
      ]) ??
      leaveTypeCode;
    const used =
      this.readNumber(leaveSource, ['Taken', 'Noofdays', 'NoOfDays', 'DaysUsed', 'Used', 'Kverb', 'Consumed', 'UsedLeave']) ??
      0;
    const total =
      this.readNumber(leaveSource, [
        'TotalEntitlement',
        'CalendarDays',
        'Total',
        'Anzhl',
        'Quota',
        'TotalLeave',
        'Entitled',
      ]) ?? used;
    const balance =
      this.readNumber(leaveSource, ['Balance', 'Remaining', 'BalanceLeave']) ?? Math.max(total - used, 0);
    const department = this.readString(leaveSource, ['Department']);
    const position = this.readString(leaveSource, ['Designation']);

    return {
      id:
        `${this.readString(leaveSource, ['Pernr']) ?? 'leave'}-${leaveTypeCode}-${this.readString(leaveSource, ['Begda', 'FromDate', 'StartDate']) ?? crypto.randomUUID()}`,
      pernr: this.readString(leaveSource, ['Pernr']) ?? '',
      employeeName: this.readString(leaveSource, ['EmpName', 'EmployeeName', 'Ename']) ?? undefined,
      type: leaveTypeText,
      leaveTypeCode,
      leaveTypeText,
      status: this.normalizeLeaveStatus(this.readString(leaveSource, ['Status', 'Stat2', 'ApprovalStatus'])),
      total,
      used,
      balance,
      startDate: this.readDate(leaveSource, ['Begda', 'FromDate', 'StartDate']),
      endDate: this.readDate(leaveSource, ['Endda', 'ToDate', 'EndDate']),
      payrollDays: this.readNumber(leaveSource, ['PayrollDays']),
      calendarDays: this.readNumber(leaveSource, ['CalendarDays']),
      department: department === '00000000' ? undefined : department,
      position: position === '99999999' ? undefined : position,
      companyCode: this.readString(leaveSource, ['CompanyCode', 'Bukrs']) ?? undefined,
      location: this.readString(leaveSource, ['PersonnelArea', 'Werks']) ?? undefined,
      createdOn: this.readDate(leaveSource, ['ChangedOn', 'CreatedOn', 'Erdat']),
      requestId: this.readString(leaveSource, ['LeaveId', 'RequestId', 'ReqId', 'DocumentId', 'DocId']) ?? undefined,
      reason: this.readString(leaveSource, ['Reason', 'Remarks', 'Note']) ?? undefined,
      raw: leaveSource,
    };
  }

  private mapPayslipRecord(record: JsonObject): PayslipRecord {
    const rawPayslip = this.readNested(record, 'raw');
    const payslipSource =
      rawPayslip && typeof rawPayslip === 'object' ? ({ ...rawPayslip, ...record } as JsonObject) : record;
    const metadataUri = this.readString(payslipSource, ['__metadata.uri', 'PdfUrl', 'ValueUrl']);
    const valueUrl = this.normalizePayslipValueUrl(metadataUri);
    const odataKeys = this.parsePayslipEntityKeys(valueUrl ?? metadataUri);
    const rawPayMonth = this.readString(payslipSource, ['PayMonth', 'Month', 'Monat']) ?? odataKeys.payMonth ?? '';
    const payMonth = rawPayMonth && /^\d+$/.test(rawPayMonth) ? rawPayMonth.padStart(2, '0') : rawPayMonth;
    const payYear = this.readString(payslipSource, ['PayYear', 'Year', 'Gjahr']) ?? odataKeys.payYear ?? '';
    const wageType = this.readString(payslipSource, ['WageType', 'Lgart', 'Type']) ?? odataKeys.wageType ?? '';
    const grossPay = this.readNumber(payslipSource, ['GrossPay', 'GrossAmount', 'BrutPay']);
    const totalDeductions = this.readNumber(payslipSource, ['TotalDeductions', 'Deductions', 'DeductionAmount']);
    const netPay =
      this.readNumber(payslipSource, ['NetPay', 'NetAmount', 'Amount', 'Betrg']) ??
      (typeof grossPay === 'number' && typeof totalDeductions === 'number'
        ? grossPay - totalDeductions
        : undefined);

    return {
      id: `${payYear}-${payMonth}-${wageType}` || crypto.randomUUID(),
      pernr: this.readString(payslipSource, ['Pernr']) ?? odataKeys.pernr ?? '',
      payMonth,
      payYear,
      wageType,
      wageText: this.readString(payslipSource, ['WageText', 'WageTypeText', 'Lgtxt']) ?? undefined,
      employeeName: this.readString(payslipSource, ['EmployeeName', 'EmpName', 'Ename']) ?? undefined,
      designation: this.readString(payslipSource, ['Designation', 'Position']) ?? undefined,
      department: this.readString(payslipSource, ['Department']) ?? undefined,
      grossPay,
      totalDeductions,
      netPay,
      bankAccount: this.readString(payslipSource, ['BankAccount', 'BankAcct', 'AccountNumber']) ?? undefined,
      bankKey: this.readString(payslipSource, ['BankKey', 'BankCode']) ?? undefined,
      currency: this.readString(payslipSource, ['Currency', 'Waers']) ?? undefined,
      status: this.readString(payslipSource, ['Status', 'PayStatus']) ?? undefined,
      label: `${this.formatMonth(payMonth)} ${payYear}`.trim(),
      amount: netPay ?? 0,
      billingDate: this.readDate(payslipSource, ['BillingDate', 'Budat', 'Bldat']),
      dueDate: this.readDate(payslipSource, ['DueDate', 'Faedn', 'Fdate']),
      valueUrl,
      raw: payslipSource,
    };
  }

  private readString(source: JsonObject, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = key.includes('.') ? this.readNested(source, key) : source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }

    return undefined;
  }

  private readProfileString(source: JsonObject, keys: string[]): string | undefined {
    const value = this.readString(source, keys);
    return this.normalizeProfileValue(value);
  }

  private readNumber(source: JsonObject, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = key.includes('.') ? this.readNested(source, key) : source[key];
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, ''));
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private readDate(source: JsonObject, keys: string[]): string | undefined {
    const value = this.readString(source, keys);
    if (!value) {
      return undefined;
    }

    if (/^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/.test(value)) {
      const match = value.match(/^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/);
      if (!match) {
        return undefined;
      }

      const date = new Date(Number(match[1]));
      return Number.isNaN(date.getTime())
        ? undefined
        : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
    }

    if (/^\d{8}$/.test(value)) {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(4, 6)) - 1;
      const day = Number(value.slice(6, 8));
      const date = new Date(Date.UTC(year, month, day));
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    const normalizedValue = value.replace(/(\.\d{3})\d+(?=Z?$)/, '$1');
    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private readNested(source: JsonObject, path: string): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in (current as JsonObject)) {
        return (current as JsonObject)[segment];
      }
      return undefined;
    }, source);
  }

  private normalizePernr(pernr: string): string {
    return pernr.toString().trim().padStart(8, '0');
  }

  private matchesPernr(recordPernr: string | undefined, expectedPernr: string): boolean {
    return this.normalizePernr(recordPernr ?? '') === expectedPernr;
  }

  private formatMonth(month: string): string {
    const monthNumber = Number(month);
    if (!monthNumber || monthNumber < 1 || monthNumber > 12) {
      return month;
    }

    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(2026, monthNumber - 1, 1),
    );
  }

  private normalizePayslipValueUrl(valueUrl?: string): string | undefined {
    if (!valueUrl) {
      return undefined;
    }

    return valueUrl.endsWith('/$value') ? valueUrl : `${valueUrl}/$value`;
  }

  private parsePayslipEntityKeys(valueUrl?: string): {
    pernr?: string;
    payMonth?: string;
    payYear?: string;
    wageType?: string;
  } {
    if (!valueUrl) {
      return {};
    }

    const match = valueUrl.match(
      /PaySlipNewSet\(Pernr='([^']+)',PayMonth='([^']+)',PayYear='([^']+)',WageType='([^']+)'\)/i,
    );

    if (!match) {
      return {};
    }

    return {
      pernr: decodeURIComponent(match[1]),
      payMonth: decodeURIComponent(match[2]),
      payYear: decodeURIComponent(match[3]),
      wageType: decodeURIComponent(match[4]),
    };
  }

  private normalizeProfileValue(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();

    // ✅ ONLY remove truly empty values
    if (!trimmed || /^n\/?a$/i.test(trimmed) || /^null$/i.test(trimmed)) {
      return undefined;
    }

    return trimmed;
  }

  private normalizeLeaveStatus(value?: string): string {
    const normalized = (value || 'SUBMITTED').trim().toUpperCase();
    if (['POSTED', 'APPROVED', 'A'].includes(normalized)) {
      return 'APPROVED';
    }
    if (['REJECTED', 'R'].includes(normalized)) {
      return 'REJECTED';
    }
    if (['CANCELLED', 'CANCELED', 'C'].includes(normalized)) {
      return 'CANCELLED';
    }
    if (['PENDING', 'SUBMITTED', 'S', 'N'].includes(normalized)) {
      return 'SUBMITTED';
    }
    return normalized;
  }
}
