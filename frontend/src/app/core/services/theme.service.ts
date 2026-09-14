import { DOCUMENT } from '@angular/common';
import { Injectable, Renderer2, RendererFactory2, effect, inject, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'kaar-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly renderer: Renderer2;
  private readonly darkMode = signal<boolean>(this.readStoredTheme());

  readonly isDarkMode = this.darkMode.asReadonly();

  constructor() {
    const rendererFactory = inject(RendererFactory2);
    this.renderer = rendererFactory.createRenderer(null, null);

    effect(() => {
      const isDark = this.darkMode();
      const body = this.document.body;

      this.renderer.removeClass(body, isDark ? 'light-theme' : 'dark-theme');
      this.renderer.addClass(body, isDark ? 'dark-theme' : 'light-theme');
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    });
  }

  toggleTheme(): void {
    this.darkMode.update((current) => !current);
  }

  private readStoredTheme(): boolean {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  }
}
