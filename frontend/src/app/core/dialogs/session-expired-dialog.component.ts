import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-session-expired-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Session Expired</h2>
    <mat-dialog-content>
      Please login again.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="warn" (click)="close()">Return to Login</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExpiredDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<SessionExpiredDialogComponent>) {}

  close(): void {
    this.dialogRef.close();
  }
}
