import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The tested modules are plain logic (no Svelte components / runes), so the
// full SvelteKit plugin isn't needed — it's only wired up here for the `$lib`
// alias and Vite's default asset handling (png imports resolve to URL strings,
// exactly as in the app). Keeping the config minimal also avoids the
// vite-plugin-svelte dev-server hooks that don't run under Vitest.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom'
	}
});
