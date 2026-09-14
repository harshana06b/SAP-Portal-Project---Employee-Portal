import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SessionDialogService } from '../services/session-dialog.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const sessionDialogService = inject(SessionDialogService);

  console.log('Auth Guard: Checking authentication');
  console.log('Auth Guard: isAuthenticated:', authService.isAuthenticated());
  console.log('Auth Guard: session:', authService.session());
  console.log('Auth Guard: token:', authService.token());

  if (authService.isAuthenticated()) {
    console.log('Auth Guard: Authentication successful, allowing access');
    return true;
  }

  console.log('Auth Guard: Not authenticated, redirecting to login');

  if (authService.consumeSessionExpiredFlag()) {
    sessionDialogService.showExpiredDialog();
  }

  return router.createUrlTree(['/login']);
};
