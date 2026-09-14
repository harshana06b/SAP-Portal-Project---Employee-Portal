import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LeaveRecord } from '../../core/models/portal.models';

interface LeaveDetailsDialogData {
  record: LeaveRecord;
}

@Component({
  selector: 'app-leave-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './leave-details-dialog.component.html',
  styleUrl: './leave-details-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveDetailsDialogComponent {
  readonly record: LeaveRecord;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: LeaveDetailsDialogData,
    private readonly dialogRef: MatDialogRef<LeaveDetailsDialogComponent>,
  ) {
    this.record = data.record;
  }

  detailRows() {
    return [
      { label: 'Personnel number', value: this.record.pernr },
      { label: 'Employee name', value: this.record.employeeName || 'Not available' },
      { label: 'Leave type code', value: this.record.leaveTypeCode || 'Not available' },
      { label: 'Leave type', value: this.record.leaveTypeText || this.record.type || 'Not available' },
      { label: 'Status', value: this.record.status || 'Not available' },
      { label: 'From date', value: this.formatDate(this.record.startDate) },
      { label: 'To date', value: this.formatDate(this.record.endDate) },
      { label: 'No. of days used', value: this.formatNumber(this.record.used) },
      { label: 'Payroll days', value: this.formatNumber(this.record.payrollDays) },
      { label: 'Calendar days', value: this.formatNumber(this.record.calendarDays) },
      { label: 'Department', value: this.record.department || 'Not assigned' },
      { label: 'Designation', value: this.record.position || 'Not assigned' },
      { label: 'Company code', value: this.record.companyCode || 'Not assigned' },
      { label: 'Personnel area', value: this.record.location || 'Not assigned' },
      { label: 'Created on', value: this.formatDate(this.record.createdOn) },
    ];
  }

  exportToExcel(): void {
    const rows = this.detailRows()
      .map(
        (row) =>
          `<tr><td style="padding:10px;border:1px solid #e8d8d8;font-weight:600;">${this.escapeHtml(row.label)}</td><td style="padding:10px;border:1px solid #e8d8d8;">${this.escapeHtml(row.value)}</td></tr>`,
      )
      .join('');

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table>
            <tr><th colspan="2" style="font-size:18px;padding:12px;">Leave Details</th></tr>
            ${rows}
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    this.downloadBlob(blob, `leave-details-${this.record.pernr}.xls`);
  }

  exportToPdf(): void {
    const popup = window.open('', '_blank', 'width=960,height=720');
    if (!popup) {
      return;
    }

    const rows = this.detailRows()
      .map(
        (row, index) => `
          <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
            <td>${this.escapeHtml(row.label)}</td>
            <td>${this.escapeHtml(row.value)}</td>
          </tr>`,
      )
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Leave Details</title>
          <style>
            body { font-family: Segoe UI, Arial, sans-serif; padding: 32px; color: #1f1720; }
            .sheet { border: 1px solid #eadbdb; border-radius: 20px; overflow: hidden; }
            .header { padding: 24px; background: linear-gradient(135deg, #fff3f3, #ffffff); border-bottom: 1px solid #eadbdb; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            p { margin: 0; color: #6b6165; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #f0e4e4; }
            th { width: 240px; background: #fff7f7; }
            tr.even td { background: #ffffff; }
            tr.odd td { background: #fff8f8; }
            .actions { margin-top: 20px; }
            @media print { .actions { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <h1>${this.escapeHtml(this.record.leaveTypeText || this.record.type || 'Leave Details')}</h1>
              <p>${this.escapeHtml(this.record.employeeName || `Employee ${this.record.pernr}`)}</p>
            </div>
            <table>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="actions">
            <button onclick="window.print()">Save as PDF</button>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
  }

  close(): void {
    this.dialogRef.close();
  }

  private formatDate(value?: string): string {
    if (!value) {
      return 'Not available';
    }

    return new DatePipe('en-US').transform(value, 'mediumDate') ?? value;
  }

  private formatNumber(value?: number): string {
    return typeof value === 'number' ? value.toFixed(2) : '0.00';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
