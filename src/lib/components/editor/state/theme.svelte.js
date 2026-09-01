/**
 * Light/dark preference for the editor chrome, applied as `data-theme` on
 * <html> where editor.css's `[data-theme='light']` overrides pick it up.
 *
 * Kept out of EditorState on purpose: this is a device preference, not part of
 * whatever the user is editing, so it should never ride along with a document
 * import/export.
 */

const VALID = ['dark', 'light'];

export class ThemeState {
	/** @type {'dark' | 'light'} */
	value = $state('dark');

	#storageKey;

	/**
	 * @param {{ storageKey?: string | null, initial?: 'dark' | 'light',
	 *           followSystem?: boolean }} [options]
	 *   `storageKey` — where to persist; pass null to not persist at all.
	 *   `followSystem` — start from `prefers-color-scheme` when nothing is stored.
	 */
	constructor({ storageKey = 'editor-theme', initial = 'dark', followSystem = true } = {}) {
		this.#storageKey = storageKey;
		this.value = initial;

		// Guarded rather than assumed: the module is imported during SSR too,
		// and localStorage throws outright in a blocked-cookies context.
		if (typeof document === 'undefined') return;

		const stored = storageKey ? readStored(storageKey) : null;
		if (stored) {
			this.value = stored;
		} else if (followSystem && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
			this.value = 'light';
		}
		this.#apply();
	}

	/** @param {'dark' | 'light'} theme */
	set(theme) {
		if (!VALID.includes(theme)) return;
		this.value = theme;
		this.#apply();
		if (this.#storageKey) {
			try {
				localStorage.setItem(this.#storageKey, theme);
			} catch {
				// Persisting is a nicety; a blocked store shouldn't break theming.
			}
		}
	}

	toggle() {
		this.set(this.value === 'dark' ? 'light' : 'dark');
	}

	#apply() {
		if (typeof document !== 'undefined') document.documentElement.dataset.theme = this.value;
	}
}

function readStored(key) {
	try {
		const stored = localStorage.getItem(key);
		return VALID.includes(stored) ? stored : null;
	} catch {
		return null;
	}
}

/**
 * The snippet to inline in your app's <head>, ahead of any bundle, so a saved
 * light theme doesn't flash dark while the page loads. Pass the same
 * `storageKey` you gave ThemeState.
 *
 * @param {string} [storageKey]
 */
export function themeBootScript(storageKey = 'editor-theme') {
	return `try{var t=localStorage.getItem(${JSON.stringify(storageKey)});if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
}
