import { CommonModule } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule, MatDrawerMode } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { PortalService } from '../services/portal.service';
import { ThemeService } from '../services/theme.service';
import { Profile } from '../models/portal.models';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatBadgeModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatTooltipModule,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly portalService = inject(PortalService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly ngZone = inject(NgZone);
  private toolbarResizeObserver?: ResizeObserver;

  @ViewChild('portalToolbar') private readonly portalToolbar?: ElementRef<HTMLElement>;

  readonly dashboardExpanded = signal(true);
  readonly sidebarOpened = signal(false);
  readonly isDesktop = signal(false);
  readonly sidebarMode = computed<MatDrawerMode>(() => (this.isDesktop() ? 'side' : 'over'));
  readonly profile = signal<Profile | null>(null);
  readonly notifications = this.notificationService.notifications;
  readonly unreadCount = this.notificationService.unreadCount;
  readonly isDarkMode = this.themeService.isDarkMode;
  readonly sessionUser = this.authService.user;
  readonly hasNotifications = computed(() => this.notifications().length > 0);
  readonly latestAlertSummary = computed(() => this.notifications()[0]?.title || 'No recent alerts');
  readonly displayName = computed(
    () => this.profile()?.fullName || this.sessionUser()?.fullName || `Employee ${this.sessionUser()?.pernr ?? ''}`,
  );

  ngOnInit(): void {
    this.breakpointObserver.observe('(min-width: 1024px)').subscribe((state) => {
      this.isDesktop.set(state.matches);
    });

    const pernr = this.sessionUser()?.pernr;
    if (!pernr) {
      return;
    }

    this.portalService.getProfile(pernr).subscribe({
      next: (profile) => {
        this.profile.set(profile);
      },
      error: () => {
        this.notificationService.push(
          'Profile pending',
          'We could not load the employee profile header just yet.',
          'warning',
        );
      },
    });
  }

  ngAfterViewInit(): void {
    const toolbar = this.portalToolbar?.nativeElement;

    if (!toolbar) {
      return;
    }

    const updateNotificationOffset = () => {
      document.documentElement.style.setProperty(
        '--portal-notification-top',
        `${Math.ceil(toolbar.getBoundingClientRect().height) + 16}px`,
      );
    };

    updateNotificationOffset();

    this.ngZone.runOutsideAngular(() => {
      this.toolbarResizeObserver = new ResizeObserver(updateNotificationOffset);
      this.toolbarResizeObserver.observe(toolbar);
    });
  }

  ngOnDestroy(): void {
    this.toolbarResizeObserver?.disconnect();
    document.documentElement.style.removeProperty('--portal-notification-top');
  }

  toggleSidebar(): void {
    this.sidebarOpened.update((opened) => !opened);
  }

  toggleDashboardGroup(): void {
    this.dashboardExpanded.update((expanded) => !expanded);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  clearNotifications(): void {
    this.notificationService.clearAll();
  }

  openProfile(): void {
    void this.router.navigate(['/profile']);
  }

  logout(): void {
    this.authService.logout(true);
  }
}
