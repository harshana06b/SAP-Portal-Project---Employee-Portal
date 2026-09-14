import { ChangeDetectionStrategy, Component, SecurityContext, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewerComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly title = input<string>('Payslip preview');
  readonly source = input<string | null>(null);

  get safeSource(): SafeResourceUrl | null {
    const source = this.source();
    return source ? this.sanitizer.bypassSecurityTrustResourceUrl(source) : null;
  }

  get safeSourceText(): string | null {
    return this.sanitizer.sanitize(SecurityContext.RESOURCE_URL, this.safeSource);
  }
}
