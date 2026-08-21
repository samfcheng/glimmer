/**
 * Central color palette for the app. Edit values here — `applyStyles()` pushes
 * them onto `:root` as CSS custom properties at startup, so every component
 * that reads `var(--color-*)` in its scoped <style> picks them up automatically
 * without needing its own edit.
 */
export const styles = {
	accent: '#3b9eff', // buttons, active toggles, drop hints
	cursorCircle: '#3b9eff', // the interactive-mode circle outline
	pathUnlit: '#ff5c5c', // debug outline of a dark region
	pathLit: '#3b9eff', // debug outline of a lit region
	danger: '#ff5c5c' // remove/clear affordances
};

export function applyStyles() {
	const root = document.documentElement.style;
	root.setProperty('--color-accent', styles.accent);
	root.setProperty('--color-selected', styles.accent);
	root.setProperty('--color-cursor-circle', styles.cursorCircle);
	root.setProperty('--color-path-unlit', styles.pathUnlit);
	root.setProperty('--color-path-lit', styles.pathLit);
	root.setProperty('--color-danger', styles.danger);
}
