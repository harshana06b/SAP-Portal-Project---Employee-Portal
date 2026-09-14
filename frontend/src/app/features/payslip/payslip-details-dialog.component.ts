import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PayslipRecord } from '../../core/models/portal.models';
import { PortalService } from '../../core/services/portal.service';
import { NotificationService } from '../../core/services/notification.service';

export interface PayslipStatementView {
  key: string;
  pernr: string;
  payMonth: string;
  payYear: string;
  label: string;
  employeeName?: string | null;
  designation?: string | null;
  department?: string | null;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  bankAccount?: string | null;
  bankKey?: string | null;
  currency?: string | null;
  status: string;
  wageLines: PayslipRecord[];
  primaryRecord: PayslipRecord;
}

interface PayslipDetailsDialogData {
  statement: PayslipStatementView;
}

@Component({
  selector: 'app-payslip-details-dialog',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './payslip-details-dialog.component.html',
  styleUrl: './payslip-details-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayslipDetailsDialogComponent {
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<PayslipDetailsDialogComponent>);

  readonly statement: PayslipStatementView;
  readonly bankAccountMasked = computed(() => this.maskBankAccount(this.statement.bankAccount));

  constructor(@Inject(MAT_DIALOG_DATA) data: PayslipDetailsDialogData) {
    this.statement = data.statement;
  }

  viewPdf(): void {
    this.portalService.downloadPayslip(this.statement.primaryRecord, 'inline').subscribe({
      next: (blob) => this.openBlobInNewTab(blob),
      error: () =>
        this.notificationService.push(
          'Payslip preview failed',
          'The SAP PDF could not be opened right now.',
          'error',
        ),
    });
  }

  downloadPdf(): void {
    this.portalService.downloadPayslip(this.statement.primaryRecord, 'attachment').subscribe({
      next: (blob) => this.downloadBlob(blob, this.getPayslipFileName()),
      error: () =>
        this.notificationService.push(
          'Download failed',
          'The payslip PDF could not be downloaded.',
          'error',
        ),
    });
  }

  printPdf(): void {
    this.portalService.downloadPayslip(this.statement.primaryRecord, 'inline').subscribe({
      next: (blob) => this.printBlob(blob),
      error: () =>
        this.notificationService.push(
          'Print failed',
          'The payslip PDF could not be prepared for printing.',
          'error',
        ),
    });
  }

  mailPayslip(): void {
    this.portalService.mailPayslip(this.statement.primaryRecord).subscribe({
      next: () =>
        this.notificationService.push(
          'Payslip mailed',
          'The payslip PDF was sent to bharshana009@gmail.com.',
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

  close(): void {
    this.dialogRef.close();
  }

  displayCode(value?: string | null): string {
    if (!value) {
      return 'Not available';
    }

    return this.removeLeadingZeroes(value);
  }

  private maskBankAccount(value?: string | null): string {
    if (!value) {
      return 'Not available';
    }

    const trimmed = value.replace(/\s+/g, '');
    if (trimmed.length <= 4) {
      return trimmed;
    }

    return `${'X'.repeat(Math.max(trimmed.length - 4, 4))}${trimmed.slice(-4)}`;
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

  private getPayslipFileName(): string {
    const month = this.removeLeadingZeroes(this.statement.payMonth);
    return `${this.removeLeadingZeroes(this.statement.pernr)}-${this.statement.payYear}-${month}-payslip.pdf`;
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
