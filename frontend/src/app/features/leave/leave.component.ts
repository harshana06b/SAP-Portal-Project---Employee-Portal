import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PortalService } from '../../core/services/portal.service';
import { LeaveRecord, LeaveSummary } from '../../core/models/portal.models';
import { LeaveDetailsDialogComponent } from './leave-details-dialog.component';

type LeaveDatasetKey = 'requests' | 'history';

@Component({
  selector: 'app-leave',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './leave.component.html',
  styleUrl: './leave.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private pendingLeaveLoads = 0;

  readonly displayedColumns = computed(() =>
    this.selectedDataset() === 'requests'
      ? ['employeeId', 'sapLeaveType', 'beginDate', 'endDate', 'numberOfDays', 'reason', 'status', 'action']
      : ['employeeId', 'sapLeaveType', 'sapLeaveDesc', 'beginDate', 'endDate', 'numberOfDays', 'status'],
  );
  readonly records = signal<LeaveRecord[]>([]);
  readonly fullDetails = signal<LeaveRecord[]>([]);
  readonly balances = signal<LeaveRecord[]>([]);
  readonly history = signal<LeaveRecord[]>([]);
  readonly requests = signal<LeaveRecord[]>([]);
  readonly withdrawnRequestKeys = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('all');
  readonly leaveTypeFilter = signal('all');
  readonly fromDateFilter = signal('');
  readonly toDateFilter = signal('');
  readonly sortOption = signal('beginDate');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(8);
  readonly selectedTabIndex = signal(0);
  readonly selectedDataset = signal<LeaveDatasetKey>('requests');
  readonly showRequestForm = signal(false);
  readonly requestForm = signal({
    leaveType: '',
    startDate: '',
    endDate: '',
    reason: '',
  });
  readonly currentEmployeeId = computed(() => this.authService.user()?.pernr ?? '');

  readonly availableStatuses = computed(() =>
    Array.from(new Set(this.records().map((record) => record.status).filter(Boolean))),
  );

  readonly activeEntitySet = computed(() => {
    switch (this.selectedDataset()) {
      case 'history':
        return 'LeaveHistoryNewSet';
      case 'requests':
      default:
        return 'LeaveRequestNewSet';
    }
  });

  readonly filteredRecords = computed(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const statusFilter = this.statusFilter().toLowerCase();
    const leaveTypeFilter = this.leaveTypeFilter().toLowerCase();
    const fromDateFilter = this.fromDateFilter();
    const toDateFilter = this.toDateFilter();
    const sortOption = this.sortOption();

    const filtered = this.records().filter((record) => {
      const matchesSearch =
        !searchTerm ||
        [
          record.employeeName,
          record.leaveTypeCode,
          record.leaveTypeText,
          record.type,
          record.status,
          record.pernr,
          record.reason,
          this.rawText(record, ['Reason']),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(searchTerm));

      const matchesStatus = statusFilter === 'all' || record.status.toLowerCase() === statusFilter;
      const matchesLeaveType =
        leaveTypeFilter === 'all' ||
        (record.leaveTypeCode || record.type || '').toLowerCase() === leaveTypeFilter ||
        (record.leaveTypeText || '').toLowerCase() === leaveTypeFilter;

      const startDate = this.parseCalendarDate(record.startDate);
      const fromDate = this.parseCalendarDate(fromDateFilter);
      const toDate = this.parseCalendarDate(toDateFilter);
      const matchesFrom = !fromDate || (startDate && startDate >= fromDate);
      const matchesTo = !toDate || (startDate && startDate <= this.endOfDay(toDate));

      return matchesSearch && matchesStatus && matchesLeaveType && Boolean(matchesFrom) && Boolean(matchesTo);
    });

    return [...filtered].sort((left, right) => this.sortRecords(left, right, sortOption));
  });

  readonly summary = computed<LeaveSummary>(() => {
    const filtered = this.filteredRecords();
    return {
      total: filtered.length,
      used: filtered.reduce((sum, record) => sum + record.used, 0),
      balance: this.balances().reduce((sum, record) => sum + record.balance, 0),
    };
  });

  readonly pendingCount = computed(
    () => this.filteredRecords().filter((record) => record.status.trim().toUpperCase() === 'SUBMITTED').length,
  );

  readonly approvedCount = computed(
    () => this.filteredRecords().filter((record) => record.status.trim().toUpperCase() === 'APPROVED').length,
  );

  readonly pageCount = computed(() => Math.max(Math.ceil(this.filteredRecords().length / this.pageSize()), 1));
  readonly pageStart = computed(() => this.pageIndex() * this.pageSize());
  readonly pagedRecords = computed(() =>
    this.filteredRecords().slice(this.pageStart(), this.pageStart() + this.pageSize()),
  );
  readonly leaveTypeOptions = computed(() => {
    const source = [...this.requests(), ...this.history(), ...this.records()];
    return Array.from(
      new Map(
        source.map((record) => [
          record.leaveTypeCode || record.type,
          record.leaveTypeText || record.type,
        ]),
      ).entries(),
    ).filter(([code]) => Boolean(code));
  });

  readonly requestDays = computed(() =>
    this.calculateInclusiveDays(this.requestForm().startDate, this.requestForm().endDate),
  );

  ngOnInit(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.withdrawnRequestKeys.set(this.loadWithdrawnRequestKeys(pernr));
    this.loadLeaveData(pernr);
  }

  openDetails(record: LeaveRecord): void {
    this.dialog.open(LeaveDetailsDialogComponent, {
      data: { record },
      width: '960px',
      maxWidth: '96vw',
      panelClass: 'leave-details-dialog-panel',
    });
  }

  statusClass(status: string): string {
    const normalized = status.trim().toUpperCase();

    if (normalized === 'POSTED' || normalized === 'APPROVED') {
      return 'status-chip--success';
    }

    if (normalized === 'SUBMITTED' || normalized === 'PENDING') {
      return 'status-chip--pending';
    }

    if (normalized === 'REJECTED') {
      return 'status-chip--rejected';
    }

    if (
      normalized === 'CANCELLED' ||
      normalized === 'CANCELED' ||
      normalized === 'LEAVE WITHDRAWN' ||
      normalized === 'WITHDRAW REQUEST'
    ) {
      return 'status-chip--cancelled';
    }

    return 'status-chip--neutral';
  }

  recordText(record: LeaveRecord, keys: string[], fallback = 'N/A'): string {
    for (const key of keys) {
      const value = record.raw[key];
      if (typeof value === 'string' && value.trim()) {
        return this.removeLeadingZeroes(value);
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }

    return fallback;
  }

  recordNumber(record: LeaveRecord, keys: string[], fallback = '0.00'): string {
    const value = this.recordText(record, keys, '');
    if (!value) {
      return fallback;
    }

    const parsed = Number(value.replace(/,/g, ''));
    return Number.isNaN(parsed) ? value : parsed.toFixed(2);
  }

  recordDate(record: LeaveRecord, keys: string[], format = 'mediumDate', fallbackValue?: string): string {
    const fallbackDate = this.formatDisplayDate(fallbackValue, format);
    if (fallbackDate) {
      return fallbackDate;
    }

    for (const key of keys) {
      const value = record.raw[key];
      const formatted = this.formatDisplayDate(value, format);
      if (formatted) {
        return formatted;
      }
    }

    return 'N/A';
  }

  canCancel(record: LeaveRecord): boolean {
    return Boolean(record.requestId) && record.status.trim().toUpperCase() === 'SUBMITTED';
  }

  canWithdraw(record: LeaveRecord): boolean {
    return record.status.trim().toUpperCase() === 'SUBMITTED';
  }

  updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.pageIndex.set(0);
  }

  updateStatusFilter(value: string): void {
    this.statusFilter.set(value);
    this.pageIndex.set(0);
  }

  updateLeaveTypeFilter(value: string): void {
    this.leaveTypeFilter.set(value);
    this.pageIndex.set(0);
  }

  updateFromDateFilter(value: string): void {
    this.fromDateFilter.set(value);

    if (this.toDateFilter() && this.toDateFilter() < value) {
      this.toDateFilter.set('');
    }

    this.pageIndex.set(0);
  }

  updateToDateFilter(value: string): void {
    this.toDateFilter.set(value);
    this.pageIndex.set(0);
  }

  updateSortOption(value: string): void {
    this.sortOption.set(value);
    this.pageIndex.set(0);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
    this.leaveTypeFilter.set('all');
    this.fromDateFilter.set('');
    this.toDateFilter.set('');
    this.sortOption.set('beginDate');
    this.pageIndex.set(0);
  }

  selectDataset(index: number): void {
    const tabs: LeaveDatasetKey[] = ['requests', 'history'];
    const dataset = tabs[index];

    this.selectedTabIndex.set(index);

    if (!dataset) {
      return;
    }

    this.selectedDataset.set(dataset);
    this.records.set(this.sourceRecords(dataset));
    this.pageIndex.set(0);
  }

  updateRequestField(field: 'leaveType' | 'startDate' | 'endDate' | 'reason', value: string): void {
    this.requestForm.update((current) => ({ ...current, [field]: value }));
  }

  submitLeaveRequest(): void {
    const pernr = this.authService.user()?.pernr;
    const form = this.requestForm();

    if (!pernr || !form.leaveType || !form.startDate || !form.endDate) {
      this.notificationService.push('Missing request details', 'Select leave type, start date, and end date.', 'warning');
      return;
    }

    if (!this.leaveTypeOptions().some(([code]) => code === form.leaveType)) {
      this.notificationService.push('Invalid leave type', 'Select a valid leave type.', 'warning');
      return;
    }

    if (this.hasLocalOverlap(form.startDate, form.endDate)) {
      this.notificationService.push(
        'Overlapping leave',
        'The selected dates overlap with an active leave request.',
        'warning',
      );
      return;
    }

    this.saving.set(true);
    this.portalService
      .createLeaveRequest({
        pernr,
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        days: this.requestDays(),
        reason: form.reason,
      })
      .subscribe({
        next: (record) => {
          this.requests.update((current) => [record, ...current]);
          this.history.update((current) => [record, ...current]);
          this.selectedTabIndex.set(0);
          this.selectedDataset.set('requests');
          this.records.set([record, ...this.requests()]);
          this.requestForm.set({ leaveType: '', startDate: '', endDate: '', reason: '' });
          this.showRequestForm.set(false);
          this.saving.set(false);
          this.notificationService.push('Leave submitted', 'Your leave request is now in submitted status.', 'success');
          this.refreshLeaveRequests();
        },
        error: (error) => {
          this.saving.set(false);
          this.notificationService.push(
            'Submit failed',
            this.getErrorMessage(error, 'The leave request could not be submitted.'),
            'error',
          );
        },
      });
  }

  cancelRequest(record: LeaveRecord): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr || !record.requestId) {
      return;
    }

    this.saving.set(true);
    this.portalService.cancelLeaveRequest(pernr, record.requestId, 'Cancelled from Employee Portal').subscribe({
      next: () => {
        this.fullDetails.update((current) => this.markCancelled(current, record.id));
        this.history.update((current) => this.markCancelled(current, record.id));
        this.requests.update((current) => this.markCancelled(current, record.id));
        this.records.update((current) => this.markCancelled(current, record.id));
        this.saving.set(false);
        this.notificationService.push('Leave cancelled', 'The request status was updated to cancelled.', 'success');
      },
      error: (error) => {
        this.saving.set(false);
        this.notificationService.push(
          'Cancel failed',
          this.getErrorMessage(error, 'The leave request could not be cancelled.'),
          'error',
        );
      },
    });
  }

  withdrawLeave(record: LeaveRecord): void {
    if (!this.canWithdraw(record)) {
      return;
    }

    const confirmed = window.confirm('Do you want to withdraw this leave request?');
    if (!confirmed) {
      return;
    }

    const pernr = this.rawText(record, ['Pernr']) || record.pernr;
    const leaveType = this.rawText(record, ['Leavetype', 'LeaveType', 'AbsType', 'Awart']) || record.leaveTypeCode || '';
    const beginDate = this.rawText(record, ['Begda', 'FromDate', 'StartDate']) || record.startDate || '';

    if (!pernr || !leaveType || !beginDate) {
      this.notificationService.push(
        'Withdraw failed',
        'Employee, leave type, and begin date are required to withdraw leave.',
        'error',
      );
      return;
    }

    this.saving.set(true);
    this.portalService
      .withdrawLeaveRequest({
        pernr,
        leaveType,
        beginDate,
      })
      .subscribe({
        next: () => {
          const key = this.leaveRequestKey(pernr, leaveType, beginDate);
          this.addWithdrawnRequestKey(pernr, key);
          this.fullDetails.update((current) => this.markWithdrawn(current, key));
          this.history.update((current) => this.markWithdrawn(current, key));
          this.requests.update((current) => this.markWithdrawn(current, key));
          this.records.update((current) => this.markWithdrawn(current, key));
          this.saving.set(false);
          this.notificationService.push('Leave withdrawn successfully', '', 'success');
          this.refreshLeaveHistory();
          this.refreshLeaveRequests();
        },
        error: () => {
          this.saving.set(false);
          this.notificationService.push(
            'Failed to withdraw leave',
            '',
            'error',
          );
        },
      });
  }

  previousPage(): void {
    this.pageIndex.update((value) => Math.max(value - 1, 0));
  }

  nextPage(): void {
    this.pageIndex.update((value) => Math.min(value + 1, this.pageCount() - 1));
  }

  exportAllToExcel(): void {
    const header = [
      'Pernr',
      'Employee Name',
      'Leave Type Code',
      'Leave Type',
      'From Date',
      'To Date',
      'Used Days',
      'Payroll Days',
      'Calendar Days',
      'Status',
      'Department',
      'Designation',
      'Company Code',
      'Personnel Area',
      'Created On',
    ];

    const rows = this.filteredRecords().map((record) => [
      record.pernr,
      record.employeeName || '',
      record.leaveTypeCode || '',
      record.leaveTypeText || record.type,
      this.formatExportDate(record.startDate),
      this.formatExportDate(record.endDate),
      this.formatNumber(record.used),
      this.formatNumber(record.payrollDays),
      this.formatNumber(record.calendarDays),
      record.status,
      record.department || '',
      record.position || '',
      record.companyCode || '',
      record.location || '',
      this.formatExportDate(record.createdOn),
    ]);

    const html = `
      <html>
        <body>
          <table>
            <tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr>
            ${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${String(cell)}</td>`).join('')}</tr>`)
        .join('')}
          </table>
        </body>
      </html>
    `;

    this.downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), 'leave-report.xls');
  }

  exportAllToPdf(): void {
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) {
      return;
    }

    const rows = this.filteredRecords()
      .map(
        (record, index) => `
          <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
            <td>${record.leaveTypeText || record.type}</td>
            <td>${this.formatExportDate(record.startDate)} - ${this.formatExportDate(record.endDate)}</td>
            <td>${this.formatNumber(record.used)}</td>
            <td>${record.status}</td>
          </tr>`,
      )
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Leave Report</title>
          <style>
            body { font-family: Segoe UI, Arial, sans-serif; padding: 28px; color: #241b1d; }
            .hero { padding: 24px; border: 1px solid #ecdede; border-radius: 22px; background: linear-gradient(135deg, #fff2f2, #ffffff); margin-bottom: 20px; }
            h1, p { margin: 0; }
            p { margin-top: 8px; color: #685f63; }
            table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 20px; }
            th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #f0e4e4; }
            th { background: #fff1f1; }
            tr.even td { background: #ffffff; }
            tr.odd td { background: #fff8f8; }
            .actions { margin-top: 16px; }
            @media print { .actions { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="hero">
            <h1>Leave Report</h1>
            <p>Records: ${this.summary().total} | Used: ${this.formatNumber(this.summary().used)} days</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Leave Type</th>
                <th>Period</th>
                <th>Used</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="actions"><button onclick="window.print()">Save as PDF</button></div>
        </body>
      </html>
    `);
    popup.document.close();
  }

  private loadLeaveData(pernr: string): void {
    this.loading.set(true);
    this.pendingLeaveLoads = 2;

    this.loadLeaveSection(
      'LeaveRequestNewSet',
      this.portalService.getLeaveRequests(pernr),
      (records) => {
        const requestRecords = this.applyWithdrawnStatuses(records);
        this.requests.set(requestRecords);
        if (this.selectedDataset() === 'requests') {
          this.records.set(requestRecords);
        }
      },
    );

    this.loadLeaveSection(
      'LeaveHistoryNewSet',
      this.portalService.getLeaveHistory(pernr),
      (records) => {
        const historyRecords = this.applyWithdrawnStatuses(records);
        this.history.set(historyRecords);
        if (this.selectedDataset() === 'history') {
          this.records.set(historyRecords);
        }
      },
    );
  }

  private refreshLeaveRequests(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.portalService.getLeaveRequests(pernr).subscribe({
      next: (records) => {
        const requestRecords = this.applyWithdrawnStatuses(records);
        this.requests.set(requestRecords);
        if (this.selectedDataset() === 'requests') {
          this.records.set(requestRecords);
        }
      },
      error: (error) => {
        this.notificationService.push(
          'Leave requests refresh failed',
          this.getErrorMessage(error, 'The submitted request was saved, but the request list could not be refreshed.'),
          'warning',
        );
      },
    });
  }

  private refreshLeaveHistory(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.portalService.getLeaveHistory(pernr).subscribe({
      next: (records) => {
        const historyRecords = this.applyWithdrawnStatuses(records);
        this.history.set(historyRecords);
        if (this.selectedDataset() === 'history') {
          this.records.set(historyRecords);
        }
      },
      error: (error) => {
        this.notificationService.push(
          'Leave history refresh failed',
          this.getErrorMessage(error, 'The leave was withdrawn, but the history table could not be refreshed.'),
          'warning',
        );
      },
    });
  }

  private loadLeaveSection(
    entitySet: string,
    request$: Observable<LeaveRecord[]>,
    update: (records: LeaveRecord[]) => void,
  ): void {
    request$
      .pipe(finalize(() => this.finishLeaveLoad()))
      .subscribe({
        next: (records) => {
          console.log(`${entitySet} SAP records:`, records);
          update(records);
        },
        error: (error) => {
          console.log(`${entitySet} SAP fetch failed:`, error);
          this.notificationService.push(
            `${entitySet} unavailable`,
            this.getErrorMessage(error, `SAP did not return ${entitySet} records.`),
            'warning',
          );
        },
      });
  }

  private finishLeaveLoad(): void {
    this.pendingLeaveLoads = Math.max(this.pendingLeaveLoads - 1, 0);
    if (this.pendingLeaveLoads === 0) {
      this.loading.set(false);
    }
  }

  private sourceRecords(dataset: LeaveDatasetKey): LeaveRecord[] {
    switch (dataset) {
      case 'history':
        return this.history();
      case 'requests':
      default:
        return this.requests();
    }
  }

  private markCancelled(records: LeaveRecord[], id: string): LeaveRecord[] {
    return records.map((item) => (item.id === id ? { ...item, status: 'CANCELLED' } : item));
  }

  private markWithdrawn(records: LeaveRecord[], key: string): LeaveRecord[] {
    return records.map((item) => (this.recordLeaveRequestKey(item) === key ? { ...item, status: 'WITHDRAW REQUEST' } : item));
  }

  private applyWithdrawnStatuses(records: LeaveRecord[]): LeaveRecord[] {
    const withdrawnKeys = this.withdrawnRequestKeys();
    if (!withdrawnKeys.size) {
      return records;
    }

    return records.map((record) =>
      withdrawnKeys.has(this.recordLeaveRequestKey(record)) ? { ...record, status: 'WITHDRAW REQUEST' } : record,
    );
  }

  private addWithdrawnRequestKey(pernr: string, key: string): void {
    this.withdrawnRequestKeys.update((current) => {
      const next = new Set(current).add(key);
      this.saveWithdrawnRequestKeys(pernr, next);
      return next;
    });
  }

  private loadWithdrawnRequestKeys(pernr: string): Set<string> {
    try {
      const raw = localStorage.getItem(this.withdrawnStorageKey(pernr));
      const keys = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private saveWithdrawnRequestKeys(pernr: string, keys: Set<string>): void {
    try {
      localStorage.setItem(this.withdrawnStorageKey(pernr), JSON.stringify([...keys]));
    } catch {
      return;
    }
  }

  private withdrawnStorageKey(pernr: string): string {
    return `employeeportal.withdrawnLeaveRequests.${String(pernr || '').trim().padStart(8, '0')}`;
  }

  private recordLeaveRequestKey(record: LeaveRecord): string {
    return this.leaveRequestKey(
      this.rawText(record, ['Pernr']) || record.pernr,
      this.rawText(record, ['Leavetype', 'LeaveType', 'AbsType', 'Awart']) || record.leaveTypeCode || '',
      this.rawText(record, ['Begda', 'FromDate', 'StartDate']) || record.startDate || '',
    );
  }

  private leaveRequestKey(pernr: string, leaveType: string, beginDate: string): string {
    return [
      String(pernr || '').trim().padStart(8, '0'),
      String(leaveType || '').trim(),
      this.normalizeDateKey(beginDate),
    ].join('|');
  }

  private normalizeDateKey(value: string): string {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }
    if (/^\d{8}$/.test(text)) {
      return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    }

    const date = this.parseCalendarDate(text);
    if (!date) {
      return text;
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private rawText(record: LeaveRecord, keys: string[]): string {
    for (const key of keys) {
      const value = record.raw[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }

    return '';
  }

  private formatExportDate(value?: string): string {
    if (!value) {
      return '';
    }

    return new DatePipe('en-US').transform(value, 'yyyy-MM-dd') ?? value;
  }

  private formatDisplayDate(value: unknown, format = 'mediumDate'): string | undefined {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }

    const text = String(value).trim();
    if (!text) {
      return undefined;
    }

    if (/^\d{8}$/.test(text)) {
      return new DatePipe('en-US').transform(
        new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))),
        format,
      ) ?? text;
    }

    const plainDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (plainDateMatch) {
      return new DatePipe('en-US').transform(
        new Date(Number(plainDateMatch[1]), Number(plainDateMatch[2]) - 1, Number(plainDateMatch[3])),
        format,
      ) ?? text;
    }

    const odataDateMatch = text.match(/^\/Date\((\d+)(?:[+-]\d{4})?\)\/$/);
    if (odataDateMatch) {
      const date = new Date(Number(odataDateMatch[1]));
      return Number.isNaN(date.getTime())
        ? text
        : new DatePipe('en-US').transform(
          new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
          format,
        ) ?? text;
    }

    const datePartMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (datePartMatch) {
      return new DatePipe('en-US').transform(
        new Date(Number(datePartMatch[1]), Number(datePartMatch[2]) - 1, Number(datePartMatch[3])),
        format,
      ) ?? text;
    }

    const normalizedText = text.replace(/(\.\d{3})\d+(?=Z?$)/, '$1');
    const parsed = new Date(normalizedText);
    return Number.isNaN(parsed.getTime()) ? text : new DatePipe('en-US').transform(parsed, format) ?? text;
  }

  private removeLeadingZeroes(value: string): string {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return trimmed.replace(/^0+(?=\d)/, '');
  }

  private formatNumber(value?: number): string {
    return typeof value === 'number' ? value.toFixed(2) : '0.00';
  }

  private sortRecords(left: LeaveRecord, right: LeaveRecord, sortOption: string): number {
    const leftBegin = this.parseCalendarDate(left.startDate)?.getTime() ?? 0;
    const rightBegin = this.parseCalendarDate(right.startDate)?.getTime() ?? 0;
    const leftEnd = this.parseCalendarDate(left.endDate)?.getTime() ?? 0;
    const rightEnd = this.parseCalendarDate(right.endDate)?.getTime() ?? 0;

    switch (sortOption) {
      case 'endDate':
        return leftEnd - rightEnd;
      case 'status':
        return left.status.localeCompare(right.status);
      case 'type':
        return (left.leaveTypeText || left.type).localeCompare(right.leaveTypeText || right.type);
      case 'beginDate':
      default:
        return leftBegin - rightBegin;
    }
  }

  private endOfDay(value: string | Date): Date {
    const date = value instanceof Date ? new Date(value) : this.parseCalendarDate(value) ?? new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private pushLeaveAlerts(records: LeaveRecord[]): void {
    const pendingCount = records.filter((record) => record.status.trim().toUpperCase() === 'SUBMITTED').length;
    if (pendingCount > 0) {
      this.notifyIfMissing(
        'Pending leave alert',
        `${pendingCount} leave request${pendingCount > 1 ? 's are' : ' is'} pending approval.`,
        'warning',
      );
    }

    const monthlyUsage = records.reduce<Record<string, number>>((accumulator, record) => {
      if (!record.startDate) {
        return accumulator;
      }

      const monthKey =
        new DatePipe('en-US').transform(record.startDate, 'MMMM yyyy') ??
        record.startDate.slice(0, 7);
      accumulator[monthKey] = (accumulator[monthKey] ?? 0) + record.used;
      return accumulator;
    }, {});

    Object.entries(monthlyUsage)
      .filter(([, usedDays]) => usedDays > 5)
      .forEach(([month, usedDays]) => {
        this.notifyIfMissing(
          'Leave threshold alert',
          `${usedDays.toFixed(2)} leave days were created in ${month}.`,
          'warning',
        );
      });
  }

  private notifyIfMissing(
    title: string,
    description: string,
    severity: 'info' | 'success' | 'warning' | 'error',
  ): void {
    const exists = this.notificationService
      .notifications()
      .some((item) => item.title === title && item.description === description);

    if (!exists) {
      this.notificationService.push(title, description, severity);
    }
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private calculateInclusiveDays(startDate: string, endDate: string): number {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = this.parseCalendarDate(startDate);
    const end = this.parseCalendarDate(endDate);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return 0;
    }

    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const body = (error as { error?: { message?: unknown; error?: unknown } }).error;
      if (typeof body?.message === 'string' && body.message.trim()) {
        return body.message;
      }
      if (typeof body?.error === 'string' && body.error.trim()) {
        return body.error;
      }
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return fallback;
  }

  private hasLocalOverlap(startDate: string, endDate: string): boolean {
    const start = this.parseCalendarDate(startDate);
    const end = this.parseCalendarDate(endDate);

    if (!start || !end) {
      return false;
    }

    return this.records().some((record) => {
      const status = record.status.trim().toUpperCase();
      if (status === 'REJECTED' || status === 'CANCELLED' || status === 'WITHDRAW REQUEST') {
        return false;
      }

      const recordStart = this.parseCalendarDate(record.startDate);
      const recordEnd = this.parseCalendarDate(record.endDate);
      return Boolean(recordStart && recordEnd && start <= recordEnd && end >= recordStart);
    });
  }

  private parseCalendarDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const text = String(value).trim();
    const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactMatch) {
      return new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
    }

    const plainMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (plainMatch) {
      return new Date(Number(plainMatch[1]), Number(plainMatch[2]) - 1, Number(plainMatch[3]));
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
