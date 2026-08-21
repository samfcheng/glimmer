import { describe, expect, it } from 'vitest';
import { parseSvgRegions } from './regions.js';

// A fixed roll keeps the dither thresholds out of these assertions.
const parse = (source) => parseSvgRegions(source, { random: () => 0.5 });

const wrap = (body, attrs = 'viewBox="0 0 100 100"') =>
	`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvgRegions', () => {
	it('reads the viewBox and one region per shape', () => {
		const { viewBox, regions } = parse(wrap('<path d="M0 0H10V10H0Z"/><path d="M20 20H30V30H20Z"/>'));
		expect(viewBox).toEqual({ x: 0, y: 0, width: 100, height: 100 });
		expect(regions).toHaveLength(2);
		expect(regions[0].centroid).toEqual({ x: 5, y: 5 });
		expect(regions[1].centroid).toEqual({ x: 25, y: 25 });
	});

	it('keeps the original path data untouched', () => {
		const [region] = parse(wrap('<path d="M0 0H10V10H0Z"/>')).regions;
		expect(region.d).toBe('M0 0H10V10H0Z');
	});

	it('flattens ancestor group transforms into the region', () => {
		const { regions } = parse(
			wrap('<g transform="translate(10 20)"><g transform="scale(2)"><path d="M0 0H10V10H0Z"/></g></g>')
		);
		expect(regions[0].centroid).toEqual({ x: 20, y: 30 });
		expect(regions[0].transform).toMatch(/^matrix\(/);
	});

	it('leaves transform null when there is nothing to apply', () => {
		expect(parse(wrap('<path d="M0 0H10V10H0Z"/>')).regions[0].transform).toBe(null);
	});

	it('converts basic shapes', () => {
		const { regions } = parse(
			wrap(
				'<rect x="0" y="0" width="10" height="10"/>' +
					'<circle cx="50" cy="50" r="5"/>' +
					'<ellipse cx="80" cy="20" rx="4" ry="8"/>' +
					'<polygon points="0,90 10,90 10,100"/>'
			)
		);
		expect(regions).toHaveLength(4);
		expect(regions[0].centroid).toEqual({ x: 5, y: 5 });
		expect(regions[1].centroid.x).toBeCloseTo(50, 3);
		expect(regions[1].centroid.y).toBeCloseTo(50, 3);
		expect(regions[2].bounds.width).toBeCloseTo(8, 2);
		expect(regions[2].bounds.height).toBeCloseTo(16, 2);
	});

	it('rounds rect corners when rx is given', () => {
		const square = parse(wrap('<rect x="0" y="0" width="10" height="10"/>')).regions[0];
		const rounded = parse(wrap('<rect x="0" y="0" width="10" height="10" rx="5"/>')).regions[0];
		// Same bounds, less area — so the same bbox but a rounder outline.
		expect(rounded.bounds).toEqual(square.bounds);
		expect(rounded.d).not.toBe(square.d);
	});

	it('ignores non-rendered subtrees and hidden elements', () => {
		const { regions } = parse(
			wrap(
				'<defs><path d="M0 0H10V10H0Z"/></defs>' +
					'<clipPath id="c"><path d="M0 0H10V10H0Z"/></clipPath>' +
					'<path d="M0 0H10V10H0Z" display="none"/>' +
					'<path d="M50 50H60V60H50Z"/>'
			)
		);
		expect(regions).toHaveLength(1);
		expect(regions[0].centroid).toEqual({ x: 55, y: 55 });
	});

	it('falls back to width/height when there is no viewBox', () => {
		const { viewBox, warnings } = parse(wrap('<path d="M0 0H10V10H0Z"/>', 'width="640" height="480"'));
		expect(viewBox).toEqual({ x: 0, y: 0, width: 640, height: 480 });
		// width/height defines the user space just as well — nothing to warn about.
		expect(warnings).toEqual([]);
	});

	it('falls back to the union of shape bounds when there is neither, with a warning', () => {
		const { viewBox, warnings } = parse(wrap('<path d="M10 10H20V30H10Z"/><path d="M40 10H50V20H40Z"/>', ''));
		expect(viewBox).toEqual({ x: 10, y: 10, width: 40, height: 20 });
		expect(warnings.join(' ')).toMatch(/no viewBox/);
	});

	it('preserves an element id as a label', () => {
		expect(parse(wrap('<path id="window-3" d="M0 0H10V10H0Z"/>')).regions[0].label).toBe('window-3');
	});

	it('skips shapes with no drawable area and says so', () => {
		const { regions, warnings } = parse(wrap('<rect x="0" y="0" width="0" height="10"/><path d="M0 0H10V10H0Z"/>'));
		expect(regions).toHaveLength(1);
		expect(warnings.join(' ')).toMatch(/Skipped 1 shape/);
	});

	it('rejects markup with no shapes', () => {
		expect(() => parse(wrap('<g></g>'))).toThrow(/No shapes/);
	});

	it('rejects something that is not an SVG', () => {
		expect(() => parse('<html><body>nope</body></html>')).toThrow();
	});

	it('gives every region a distinct id and its own threshold', () => {
		const { regions } = parseSvgRegions(wrap('<path d="M0 0H1V1Z"/><path d="M5 5H6V6Z"/>'));
		expect(new Set(regions.map((r) => r.id)).size).toBe(2);
		expect(regions.every((r) => r.threshold >= 0 && r.threshold < 1)).toBe(true);
	});
});
