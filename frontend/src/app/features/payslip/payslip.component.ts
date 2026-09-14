import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PortalService } from '../../core/services/portal.service';
import { PayslipRecord } from '../../core/models/portal.models';
import {
  PayslipDetailsDialogComponent,
  PayslipStatementView,
} from './payslip-details-dialog.component';

@Component({
  selector: 'app-payslip',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    KpiCardComponent,
  ],
  templateUrl: './payslip.component.html',
  styleUrl: './payslip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayslipComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialog = inject(MatDialog);

  readonly displayedColumns = ['period', 'gross', 'deductions', 'net', 'status', 'actions'];
  readonly payslips = signal<PayslipRecord[]>([]);
  readonly selectedMonth = signal('all');
  readonly selectedYear = signal('all');
  readonly loading = signal(false);
  readonly previewUrl = signal<string | null>(null);

  readonly monthOptions = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
  readonly yearOptions = computed(() => {
    const currentYear = new Date().getFullYear();
    const staticYears = Array.from({ length: 6 }, (_, index) => String(currentYear - index));
    const sapYears = this.payslips().map((record) => record.payYear).filter(Boolean);
    return Array.from(new Set([...sapYears, ...staticYears])).sort((left, right) => Number(right) - Number(left));
  });

  readonly statements = computed<PayslipStatementView[]>(() => {
    const grouped = new Map<string, PayslipRecord[]>();

    for (const record of this.payslips()) {
      const key = `${record.pernr}-${record.payYear}-${record.payMonth}`;
      const current = grouped.get(key) ?? [];
      current.push(record);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([key, records]) => this.toStatement(key, records))
      .sort((left, right) => {
        const leftKey = Number(`${left.payYear}${left.payMonth.padStart(2, '0')}`);
        const rightKey = Number(`${right.payYear}${right.payMonth.padStart(2, '0')}`);
        return rightKey - leftKey;
      });
  });

  readonly filteredStatements = computed(() =>
    this.statements().filter((statement) => {
      const monthMatches = this.selectedMonth() === 'all' || statement.payMonth === this.selectedMonth();
      const yearMatches = this.selectedYear() === 'all' || statement.payYear === this.selectedYear();
      return monthMatches && yearMatches;
    }),
  );

  readonly activeStatement = computed(() => this.filteredStatements()[0] ?? null);
  readonly grossPay = computed(() => this.activeStatement()?.grossPay ?? 0);
  readonly totalDeductions = computed(() => this.activeStatement()?.totalDeductions ?? 0);
  readonly netPay = computed(() => this.activeStatement()?.netPay ?? 0);
  readonly activeWageLines = computed(() => this.activeStatement()?.wageLines ?? []);
  readonly headerEmployee = computed(() => this.activeStatement()?.employeeName || 'Employee');
  readonly headerDesignation = computed(() => this.activeStatement()?.designation || 'Designation unavailable');
  readonly headerDepartment = computed(() => this.activeStatement()?.department || 'Department unavailable');
  readonly headerBankAccount = computed(() => this.maskBankAccount(this.activeStatement()?.bankAccount));
  readonly headerBankKey = computed(() => this.activeStatement()?.bankKey || 'Not available');

  ngOnInit(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.loadPayslips();
  }

  loadPayslips(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.loading.set(true);
    this.portalService.getPayslips(pernr, {
      payMonth: this.selectedMonth(),
      payYear: this.selectedYear(),
    }).subscribe({
      next: (records) => {
        this.payslips.set(records);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notificationService.push(
          'Payslip unavailable',
          'We could not fetch the live payslip list.',
          'error',
        );
      },
    });
  }

  updateMonth(value: string): void {
    this.selectedMonth.set(value);
    this.loadPayslips();
  }

  updateYear(value: string): void {
    this.selectedYear.set(value);
    this.loadPayslips();
  }

  openDetails(statement: PayslipStatementView): void {
    this.dialog.open(PayslipDetailsDialogComponent, {
      data: { statement },
      width: '1180px',
      maxWidth: '96vw',
      panelClass: 'payslip-details-dialog-panel',
    });
  }

  downloadPdf(statement: PayslipStatementView): void {
    this.portalService.downloadPayslip(statement.primaryRecord, 'attachment').subscribe({
      next: (blob) => this.downloadBlob(blob, this.getPayslipFileName(statement)),
      error: () =>
        this.notificationService.push(
          'Download failed',
          'The selected payslip could not be downloaded.',
          'error',
        ),
    });
  }

  printPdf(statement: PayslipStatementView): void {
    this.portalService.downloadPayslip(statement.primaryRecord, 'inline').subscribe({
      next: (blob) => this.printBlob(blob),
      error: () =>
        this.notificationService.push(
          'Print failed',
          'The selected payslip could not be prepared for printing.',
          'error',
        ),
    });
  }

  mailPayslip(statement: PayslipStatementView): void {
    this.portalService.mailPayslip(statement.primaryRecord).subscribe({
      next: () =>
        this.notificationService.push(
          'Payslip mailed',
          'The payslip PDF was sent to bharshana06@gmail.com.',
          'success',
        ),
      error: (error) =>
        this.notificationService.push(
          'Mail failed',
          this.getErrorMessage(error, 'The payslip PDF could not be mailed.'),
          'error',
        ),
    });
  }

  previewPdf(statement: PayslipStatementView): void {
    this.portalService.downloadPayslip(statement.primaryRecord, 'inline').subscribe({
      next: (blob) => this.openBlobInNewTab(blob),
      error: () =>
        this.notificationService.push(
          'Preview failed',
          'The selected payslip preview could not be opened.',
          'error',
        ),
    });
  }

  statusClass(status: string): string {
    const normalized = status.trim().toUpperCase();
    if (normalized === 'PAID' || normalized === 'PROCESSED') {
      return 'status-chip--success';
    }
    if (normalized === 'PENDING') {
      return 'status-chip--pending';
    }
    if (normalized === 'REJECTED' || normalized === 'FAILED') {
      return 'status-chip--rejected';
    }
    return 'status-chip--neutral';
  }

  monthLabel(month: string): string {
    const monthNumber = Number(month);
    if (!monthNumber || monthNumber < 1 || monthNumber > 12) {
      return month;
    }

    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(2026, monthNumber - 1, 1),
    );
  }

  maskBankAccount(value?: string | null): string {
    if (!value) {
      return 'Not available';
    }

    const trimmed = value.replace(/\s+/g, '');
    if (trimmed.length <= 4) {
      return trimmed;
    }

    return `${'X'.repeat(Math.max(trimmed.length - 4, 4))}${trimmed.slice(-4)}`;
  }

  displayCode(value?: string | null): string {
    if (!value) {
      return 'Not available';
    }

    return this.removeLeadingZeroes(value);
  }

  ngOnDestroy(): void {
    this.releasePreviewUrl();
  }

  private toStatement(key: string, records: PayslipRecord[]): PayslipStatementView {
    const primary = records[0];
    const earnings = records
      .filter((record) => (record.amount ?? 0) >= 0)
      .reduce((sum, record) => sum + (record.amount ?? 0), 0);
    const deductions = Math.abs(
      records
        .filter((record) => (record.amount ?? 0) < 0)
        .reduce((sum, record) => sum + (record.amount ?? 0), 0),
    );

    return {
      key,
      pernr: primary.pernr,
      payMonth: primary.payMonth,
      payYear: primary.payYear,
      label: `${this.monthLabel(primary.payMonth)} ${primary.payYear}`.trim(),
      employeeName: primary.employeeName,
      designation: primary.designation,
      department: primary.department,
      grossPay: primary.grossPay ?? earnings,
      totalDeductions: primary.totalDeductions ?? deductions,
      netPay: primary.netPay ?? primary.amount ?? Math.max(earnings - deductions, 0),
      bankAccount: primary.bankAccount,
      bankKey: primary.bankKey,
      currency: primary.currency,
      status: primary.status || 'Processed',
      wageLines: [...records].sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0)),
      primaryRecord: primary,
    };
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private printBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    document.body.appendChild(frame);

    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
  }

  private openBlobInNewTab(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  private releasePreviewUrl(): void {
    if (this.previewUrl()) {
      URL.revokeObjectURL(this.previewUrl()!);
      this.previewUrl.set(null);
    }
  }

  private getPayslipFileName(statement: PayslipStatementView): string {
    const month = this.removeLeadingZeroes(statement.payMonth);
    return `${this.removeLeadingZeroes(statement.pernr)}-${statement.payYear}-${month}-payslip.pdf`;
  }

  private removeLeadingZeroes(value: string): string {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return trimmed.replace(/^0+(?=\d)/, '');
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

    return fallback;
  }
}
