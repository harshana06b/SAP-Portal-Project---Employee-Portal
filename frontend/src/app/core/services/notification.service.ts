import { Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationItem } from '../models/portal.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly items = signal<NotificationItem[]>([]);

  readonly notifications = computed(() => this.items());
  readonly unreadCount = computed(() => this.items().length);

  push(
    title: string,
    description: string,
    severity: NotificationItem['severity'] = 'info',
  ): void {
    const notification: NotificationItem = {
      id: crypto.randomUUID(),
      title,
      description,
      severity,
      createdAt: new Date().toISOString(),
    };

    const panelClass = ['portal-snackbar', `snackbar-${severity}`];

    if (title === 'Payslip mailed') {
      panelClass.push('snackbar-payslip-mail');
    }

    this.items.update((current) => [notification, ...current].slice(0, 8));
    this.snackBar.open(description ? `${title}: ${description}` : title, 'Dismiss', {
      duration: 5000,
      panelClass,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }

  clearAll(): void {
    this.items.set([]);
  }
}
