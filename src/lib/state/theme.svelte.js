const STORAGE_KEY = 'glimmer-theme';

/**
 * UI theme preference (dark by default), applied as `data-theme` on <html>
 * where app.css's `:root[data-theme='light']` overrides pick it up. Persisted
 * to localStorage; app.html has a matching inline script that re-applies the
 * saved value before first paint. Lives outside AppState because it's a device
 * preference, not scene state — it shouldn't ride along with an import/export.
 */
class ThemeState {
	value = $state('dark');

	constructor() {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') this.value = stored;
		document.documentElement.dataset.theme = this.value;
	}

	set(theme) {
		this.value = theme;
		document.documentElement.dataset.theme = theme;
		localStorage.setItem(STORAGE_KEY, theme);
	}
}

export const theme = new ThemeState();
