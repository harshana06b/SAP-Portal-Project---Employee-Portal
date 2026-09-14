import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { AuthSession, LoginPayload } from '../models/portal.models';
import { PortalService } from './portal.service';
import { NotificationService } from './notification.service';

const SESSION_KEY = 'kaar-session';
const LOGOUT_FLAG_KEY = 'kaar-session-expired';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);
  private readonly sessionState = signal<AuthSession | null>(this.readSession());

  readonly session = computed(() => this.sessionState());
  readonly token = computed(() => this.sessionState()?.token ?? null);
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly employeeId = computed(() => this.sessionState()?.user.pernr ?? null);

  login(payload: LoginPayload) {
    return this.portalService.login(payload).pipe(
      tap((session) => {
        const normalizedSession = this.normalizeSession(session);
        console.log('AuthService: Setting session state', normalizedSession);
        this.sessionState.set(normalizedSession);
        console.log('AuthService: Session state after set:', this.sessionState());
        console.log('AuthService: isAuthenticated:', this.isAuthenticated());
        localStorage.setItem(SESSION_KEY, JSON.stringify(normalizedSession));
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      }),
    );
  }

  logout(showNotice = true): void {
    this.sessionState.set(null);
    localStorage.removeItem(SESSION_KEY);

    if (showNotice) {
      sessionStorage.setItem(LOGOUT_FLAG_KEY, 'true');
      this.notificationService.push(
        'Signed out',
        'Your portal session has ended. Please login again.',
        'warning',
      );
    }

    void this.router.navigate(['/login']);
  }

  expireSession(): void {
    this.sessionState.set(null);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.setItem(LOGOUT_FLAG_KEY, 'true');
  }

  consumeSessionExpiredFlag(): boolean {
    const shouldShow = sessionStorage.getItem(LOGOUT_FLAG_KEY) === 'true';
    if (shouldShow) {
      sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    }
    return shouldShow;
  }

  isAuthenticated(): boolean {
    return Boolean(this.sessionState()?.token);
  }

  private readSession(): AuthSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    try {
      return this.normalizeSession(JSON.parse(raw) as AuthSession);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private normalizeSession(session: AuthSession): AuthSession {
    return {
      ...session,
      user: {
        ...session.user,
        pernr: session.user.pernr.toString().trim().padStart(8, '0'),
      },
    };
  }
}
