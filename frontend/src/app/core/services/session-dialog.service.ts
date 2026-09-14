import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SessionExpiredDialogComponent } from '../dialogs/session-expired-dialog.component';

@Injectable({ providedIn: 'root' })
export class SessionDialogService {
  private readonly dialog = inject(MatDialog);
  private isOpen = false;

  showExpiredDialog(): void {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.dialog
      .open(SessionExpiredDialogComponent, {
        width: '420px',
        disableClose: true,
      })
      .afterClosed()
      .subscribe(() => {
        this.isOpen = false;
      });
  }
}
