import { describe, it, expect } from 'vitest';
import { formatPercent, parsePercent } from './percent.js';

describe('percent helpers', () => {
	it('formats a 0-1 fraction as a rounded percent string', () => {
		expect(formatPercent(0)).toBe('0%');
		expect(formatPercent(0.5)).toBe('50%');
		expect(formatPercent(1)).toBe('100%');
		expect(formatPercent(0.333)).toBe('33%');
	});

	it('parses a percent string back to a fraction', () => {
		expect(parsePercent('50%')).toBeCloseTo(0.5);
		expect(parsePercent('  20 %')).toBeCloseTo(0.2);
		expect(parsePercent('100')).toBeCloseTo(1);
	});

	it('round-trips whole percents', () => {
		for (const p of [0, 10, 25, 50, 75, 100]) {
			expect(formatPercent(parsePercent(`${p}%`))).toBe(`${p}%`);
		}
	});
});
