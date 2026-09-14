import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChartConfiguration } from 'chart.js';
import { forkJoin } from 'rxjs';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PortalService } from '../../core/services/portal.service';
import { LeaveRecord, LeaveSummary, PayslipRecord } from '../../core/models/portal.models';

interface PayslipStatementSummary {
  key: string;
  label: string;
  payMonth: string;
  payYear: string;
  netPay: number;
  anchorDate?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    KpiCardComponent,
    ChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);

  readonly leaveRecords = signal<LeaveRecord[]>([]);
  readonly payslips = signal<PayslipRecord[]>([]);
  readonly leaveLoading = signal(false);
  readonly payslipLoading = signal(false);
  readonly selectedYear = signal('all');
  readonly selectedStatus = signal('all');

  readonly availableYears = computed(() => {
    const years = new Set<string>();

    for (const record of this.leaveRecords()) {
      if (record.startDate) {
        years.add(new Date(record.startDate).getUTCFullYear().toString());
      }
    }

    for (const record of this.payslips()) {
      if (record.payYear) {
        years.add(record.payYear);
      }
    }

    return [...years].sort((left, right) => Number(right) - Number(left));
  });

  readonly availableStatuses = computed(() =>
    Array.from(new Set(this.leaveRecords().map((record) => record.status).filter(Boolean))),
  );

  readonly filteredLeaveRecords = computed(() => {
    const year = this.selectedYear();
    const status = this.selectedStatus().toLowerCase();

    return this.leaveRecords().filter((record) => {
      const yearMatches =
        year === 'all' ||
        (record.startDate && new Date(record.startDate).getUTCFullYear().toString() === year);
      const statusMatches = status === 'all' || record.status.toLowerCase() === status;
      return Boolean(yearMatches) && statusMatches;
    });
  });

  readonly filteredPayslips = computed(() => {
    const year = this.selectedYear();
    return this.payslips().filter((record) => year === 'all' || record.payYear === year);
  });

  readonly leaveSummary = computed<LeaveSummary>(() =>
    this.portalService.getLeaveSummary(this.filteredLeaveRecords()),
  );

  readonly payslipSummaries = computed<PayslipStatementSummary[]>(() => {
    const grouped = new Map<string, PayslipRecord[]>();

    for (const record of this.filteredPayslips()) {
      const key = `${record.pernr}-${record.payYear}-${record.payMonth}`;
      const current = grouped.get(key) ?? [];
      current.push(record);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([key, records]) => this.toPayslipSummary(key, records))
      .sort((left, right) => {
        const leftKey = Number(`${left.payYear}${left.payMonth.padStart(2, '0')}`);
        const rightKey = Number(`${right.payYear}${right.payMonth.padStart(2, '0')}`);
        return leftKey - rightKey;
      });
  });

  readonly leaveTrendData = computed<ChartConfiguration['data']>(() =>
    this.buildLeaveTrendChart(this.filteredLeaveRecords()),
  );
  readonly leaveMixData = computed<ChartConfiguration['data']>(() =>
    this.buildLeaveMixChart(this.filteredLeaveRecords()),
  );
  readonly agingData = computed<ChartConfiguration['data']>(() =>
    this.buildFinanceAgingChart(this.payslipSummaries()),
  );

  readonly lineChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: '#746d71' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#746d71' },
        grid: { color: 'rgba(227, 30, 36, 0.06)' },
      },
      y: {
        beginAtZero: true,
        grace: '10%',
        ticks: { color: '#746d71' },
        grid: { color: 'rgba(227, 30, 36, 0.06)' },
      },
    },
  };

  readonly doughnutChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#746d71' },
      },
    },
  };

  readonly barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        ticks: { color: '#746d71' },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        grace: '10%',
        ticks: { color: '#746d71' },
        grid: { color: 'rgba(227, 30, 36, 0.06)' },
      },
    },
  };

  ngOnInit(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.loadLeaveData(pernr);
    this.loadPayslipData(pernr);
  }

  updateYear(value: string): void {
    this.selectedYear.set(value);
  }

  updateStatus(value: string): void {
    this.selectedStatus.set(value);
  }

  resetFilters(): void {
    this.selectedYear.set('all');
    this.selectedStatus.set('all');
  }

  private loadLeaveData(pernr: string): void {
    this.leaveLoading.set(true);

    forkJoin({
      history: this.portalService.getLeaveHistory(pernr),
      requests: this.portalService.getLeaveRequests(pernr),
    }).subscribe({
      next: ({ history, requests }) => {
        const leaveRecords = this.mergeLeaveRecords(history, requests);
        console.log('Dashboard SAP leave history records:', history);
        console.log('Dashboard SAP leave request records:', requests);
        this.leaveRecords.set(leaveRecords);
        this.leaveLoading.set(false);
      },
      error: () => this.handleLeaveLoadError(),
    });
  }

  private loadPayslipData(pernr: string): void {
    this.payslipLoading.set(true);

    this.portalService.getPayslips(pernr).subscribe({
      next: (payslips) => {
        console.log('Dashboard SAP payslip records:', payslips);
        this.payslips.set(payslips);
        this.payslipLoading.set(false);
      },
      error: () => {
        this.payslipLoading.set(false);
        this.notificationService.push(
          'Payslip chart unavailable',
          'Leave charts are still loaded from SAP, but payroll data could not be loaded.',
          'warning',
        );
      },
    });
  }

  private handleLeaveLoadError(): void {
    this.leaveLoading.set(false);
    this.notificationService.push(
      'Leave dashboard unavailable',
      'We could not load live leave data from SAP.',
      'error',
    );
  }

  private mergeLeaveRecords(history: LeaveRecord[], requests: LeaveRecord[]): LeaveRecord[] {
    const merged = new Map<string, LeaveRecord>();

    for (const record of [...history, ...requests]) {
      merged.set(this.leaveRecordKey(record), record);
    }

    return [...merged.values()];
  }

  private leaveRecordKey(record: LeaveRecord): string {
    return [
      record.pernr,
      record.leaveTypeCode || record.type,
      record.startDate || '',
      record.endDate || '',
      record.used,
    ].join('|');
  }

  private buildLeaveTrendChart(records: LeaveRecord[]): ChartConfiguration['data'] {
    const grouped = new Map<string, number>();

    for (const record of records) {
      if (!record.startDate) {
        continue;
      }

      const date = new Date(record.startDate);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      grouped.set(key, (grouped.get(key) ?? 0) + record.used);
    }

    const entries = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
    const labels = entries.map(([key]) => {
      const [year, month] = key.split('-').map(Number);
      return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(
        new Date(Date.UTC(year, month - 1, 1)),
      );
    });

    return {
      labels,
      datasets: [
        {
          label: 'Used leave days',
          data: entries.map(([, value]) => Number(value.toFixed(2))),
          borderColor: '#E31E24',
          backgroundColor: 'rgba(227, 30, 36, 0.18)',
          fill: true,
          tension: 0.32,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  }

  private buildLeaveMixChart(records: LeaveRecord[]): ChartConfiguration['data'] {
    const grouped = records.reduce<Record<string, number>>((accumulator, record) => {
      const key = record.leaveTypeText || record.type || 'Leave';
      accumulator[key] = (accumulator[key] ?? 0) + record.used;
      return accumulator;
    }, {});

    const entries = Object.entries(grouped)
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1]);

    return {
      labels: entries.map(([label]) => label),
      datasets: [
        {
          label: 'Used leave mix',
          data: entries.map(([, value]) => Number(value.toFixed(2))),
          backgroundColor: ['#E31E24', '#F46B45', '#FF9F1C', '#EF476F', '#C83E4D', '#FF7A59'],
          hoverOffset: 8,
        },
      ],
    };
  }

  private buildFinanceAgingChart(records: PayslipStatementSummary[]): ChartConfiguration['data'] {
    const buckets = new Map<string, number>([
      ['Current', 0],
      ['1-30 days', 0],
      ['31-60 days', 0],
      ['61-90 days', 0],
      ['90+ days', 0],
    ]);
    const today = new Date();

    for (const record of records) {
      const anchorDate = record.anchorDate ? new Date(record.anchorDate) : undefined;
      if (!anchorDate || Number.isNaN(anchorDate.getTime())) {
        continue;
      }

      const diffDays = Math.floor((today.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        buckets.set('Current', (buckets.get('Current') ?? 0) + record.netPay);
      } else if (diffDays <= 30) {
        buckets.set('1-30 days', (buckets.get('1-30 days') ?? 0) + record.netPay);
      } else if (diffDays <= 60) {
        buckets.set('31-60 days', (buckets.get('31-60 days') ?? 0) + record.netPay);
      } else if (diffDays <= 90) {
        buckets.set('61-90 days', (buckets.get('61-90 days') ?? 0) + record.netPay);
      } else {
        buckets.set('90+ days', (buckets.get('90+ days') ?? 0) + record.netPay);
      }
    }

    return {
      labels: [...buckets.keys()],
      datasets: [
        {
          label: 'Payroll value',
          data: [...buckets.values()].map((value) => Number(value.toFixed(2))),
          backgroundColor: ['#2E8B57', '#F6C244', '#F59E0B', '#F46B45', '#E31E24'],
          borderRadius: 14,
        },
      ],
    };
  }

  private toPayslipSummary(key: string, records: PayslipRecord[]): PayslipStatementSummary {
    const primary = records[0];
    const positive = records
      .filter((record) => (record.amount ?? 0) > 0)
      .reduce((sum, record) => sum + (record.amount ?? 0), 0);
    const negative = Math.abs(
      records
        .filter((record) => (record.amount ?? 0) < 0)
        .reduce((sum, record) => sum + (record.amount ?? 0), 0),
    );
    const month = Number(primary.payMonth || '1');
    const year = Number(primary.payYear || '2026');

    return {
      key,
      label: `${this.formatMonth(primary.payMonth)} ${primary.payYear}`.trim(),
      payMonth: primary.payMonth,
      payYear: primary.payYear,
      netPay: primary.netPay ?? primary.amount ?? Math.max(positive - negative, 0),
      anchorDate:
        primary.dueDate ??
        primary.billingDate ??
        (Number.isNaN(year) || Number.isNaN(month)
          ? undefined
          : new Date(Date.UTC(year, Math.max(month - 1, 0), 1)).toISOString()),
    };
  }

  private formatMonth(month: string): string {
    const monthNumber = Number(month);
    if (!monthNumber || monthNumber < 1 || monthNumber > 12) {
      return month;
    }

    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(Date.UTC(2026, monthNumber - 1, 1)),
    );
  }
}
