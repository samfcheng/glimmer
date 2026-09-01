/**
 * Ready-made `formatValue` / `parseValue` pairs for <Slider>, so the common
 * cases don't get re-written (slightly differently) in every panel section.
 */

/** 0.35 → "35%". Pair with `parsePercent`. */
export function formatPercent(value) {
	return `${Math.round(value * 100)}%`;
}

/** "35%" or "35" → 0.35. The inverse of `formatPercent`. */
export function parsePercent(text) {
	const parsed = parseFloat(String(text).replace('%', ''));
	return Number.isNaN(parsed) ? NaN : parsed / 100;
}

/** 120 → "120ms". */
export function formatMs(value) {
	return `${Math.round(value)}ms`;
}

/**
 * 1.5 → "1.5px", 2 → "2px". Trailing zeros are trimmed so a whole number
 * doesn't read as "2.00px" just because the step happens to be fractional.
 *
 * @param {number} [decimals] maximum digits after the point
 */
export function formatPx(value, decimals = 2) {
	return `${Number(value.toFixed(decimals))}px`;
}
