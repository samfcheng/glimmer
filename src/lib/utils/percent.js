/** Shared display/parse pair for sliders whose underlying value is a 0-1 fraction shown as a percent. */
export function formatPercent(v) {
	return Math.round(v * 100) + '%';
}

export function parsePercent(text) {
	return parseFloat(text.replace('%', '').trim()) / 100;
}
