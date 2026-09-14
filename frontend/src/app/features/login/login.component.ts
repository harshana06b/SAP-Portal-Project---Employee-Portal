import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly themeService = inject(ThemeService);

  readonly isSubmitting = signal(false);
  readonly isDarkMode = this.themeService.isDarkMode;
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: (session) => {
        console.log('Login successful, session received:', session);
        console.log('Is authenticated:', this.authService.isAuthenticated());
        console.log('Session state:', this.authService.session());

        // this.notificationService.push(
        //   'Welcome back',
        //   'Authentication successful. Loading your dashboard.',
        //   'success',
        // );
        this.isSubmitting.set(false);

        // Use a small delay to ensure session state is updated
        setTimeout(() => {
          console.log('Attempting navigation to /dashboard');
          console.log('Is authenticated before nav:', this.authService.isAuthenticated());
          this.router.navigate(['/dashboard']).then((success) => {
            console.log('Navigation result:', success);
            if (!success) {
              console.error('Navigation was prevented by guards');
              this.notificationService.push(
                'Navigation Error',
                'Failed to navigate to dashboard - check browser console',
                'error',
              );
            }
          }).catch((error) => {
            console.error('Navigation error:', error);
            this.notificationService.push(
              'Navigation Error',
              'Failed to navigate to dashboard',
              'error',
            );
          });
        }, 100);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        console.error('Login error:', error);
        this.notificationService.push(
          'Login failed',
          error?.error?.message ?? 'Please verify your employee credentials.',
          'error',
        );
      },
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }
}
