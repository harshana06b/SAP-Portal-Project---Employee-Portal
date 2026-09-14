import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { PortalService } from '../../core/services/portal.service';
import { Profile } from '../../core/models/portal.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [MatCardModule, KpiCardComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly portalService = inject(PortalService);
  private readonly notificationService = inject(NotificationService);

  readonly profile = signal<Profile | null>(null);

  ngOnInit(): void {
    const pernr = this.authService.user()?.pernr;
    if (!pernr) {
      return;
    }

    this.portalService.getProfile(pernr).subscribe({
      next: (profile) => this.profile.set(profile),
      error: () =>
        this.notificationService.push(
          'Profile unavailable',
          'The employee profile could not be retrieved.',
          'error',
        ),
    });
  }

  detailItems(profile: Profile) {
    return [
      { label: 'First name', value: profile.firstName || 'Not available' },
      { label: 'Last name', value: profile.lastName || 'Not available' },
      { label: 'Position', value: profile.position || 'Not Assigned' },
      { label: 'Department', value: profile.department || 'Not Assigned' },
      { label: 'Company code', value: profile.companyCode || 'Not Assigned' },
      { label: 'Personnel area', value: profile.location || 'Not Assigned' },
      { label: 'Employee group', value: profile.employeeGroup || 'Not Assigned' },
      { label: 'Employee subgroup', value: profile.employeeSubgroup || 'Not Assigned' },
    ];
  }

  formatPersonnelNumber(pernr: string): string {
    return pernr.replace(/^0+/, '') || pernr;
  }
}
