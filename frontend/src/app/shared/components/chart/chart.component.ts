import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [MatCardModule, BaseChartDirective],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly type = input.required<ChartType>();
  readonly data = input.required<ChartConfiguration['data']>();
  readonly options = input.required<ChartConfiguration['options']>();
  readonly emptyMessage = input<string>('No chart data available for the current filters.');

  get hasData(): boolean {
    const data = this.data();
    if (!data.labels?.length || !data.datasets?.length) {
      return false;
    }

    return data.datasets.some((dataset) =>
      (dataset.data ?? []).some((value) => {
        if (typeof value === 'number') {
          return !Number.isNaN(value);
        }

        return value !== null && value !== undefined;
      }),
    );
  }
}
