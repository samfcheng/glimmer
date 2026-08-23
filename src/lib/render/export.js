/**
 * Recording an animation to video.
 *
 * The stage draws with SVG; this draws the same scene with canvas, because
 * `MediaRecorder` records a canvas stream and nothing else. The two renderers
 * are therefore separate implementations of one picture, and the comments
 * below flag every place they could drift apart.
 *
 * What they do share is the part that matters: levels come from
 * `sequenceLevels`, the same pure function the frame loop calls. The export
 * doesn't re-derive the animation, it replays it.
 */

import { parseTransform } from '../svg/matrix.js';
import { sequenceLevels, totalDuration } from '../light/animation.js';
import { settings } from '../config/settings.js';

/** Best container/codec this browser can actually record — mp4 where the encoder allows it, webm otherwise. */
export function pickVideoType() {
	const candidates = [
		'video/mp4;codecs=avc1.640028',
		'video/mp4',
		'video/webm;codecs=vp9',
		'video/webm'
	];
	if (typeof MediaRecorder === 'undefined') return '';
	return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

async function loadImage(url) {
	const image = new Image();
	image.crossOrigin = 'anonymous';
	image.src = url;
	await image.decode();
	return image;
}

/**
 * One `Path2D` per region with its ancestor transform already baked in.
 *
 * Built once for a recording rather than per frame: parsing several hundred
 * `d` strings is the expensive part of drawing, and none of it changes while
 * the animation plays.
 */
function buildPaths(regions) {
	return regions.map((region) => {
		const path = new Path2D();
		const matrix = region.transform ? new DOMMatrix(parseTransform(region.transform)) : undefined;
		path.addPath(new Path2D(region.d), matrix);
		return path;
	});
}

/**
 * The scene at one set of levels, composited into `ctx`.
 *
 * Mirrors `Scene.svelte`: base image, then the active image showing only
 * through the region mask. Canvas has no `mask` attribute, so the mask is
 * painted on its own canvas and applied with `destination-in`.
 */
function drawFrame({ ctx, base, active, mask, lit, paths, levels, frame, padding }) {
	const { canvas } = ctx;
	const scaleX = canvas.width / frame.width;
	const scaleY = canvas.height / frame.height;
	const setFrameSpace = (target) =>
		target.setTransform(scaleX, 0, 0, scaleY, -frame.x * scaleX, -frame.y * scaleY);

	// Both images are stretched to the frame, exactly as the stage does — the
	// regions are authored against the viewBox, so matching it is what keeps a
	// window's path over its window.
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
	if (!active) return;

	const maskCtx = mask.getContext('2d');
	maskCtx.setTransform(1, 0, 0, 1, 0, 0);
	maskCtx.clearRect(0, 0, mask.width, mask.height);
	setFrameSpace(maskCtx);
	maskCtx.fillStyle = '#fff';
	maskCtx.strokeStyle = '#fff';
	maskCtx.lineJoin = 'round';
	// `regionPaddingPx` is a *screen* px measurement on the stage; here the
	// output pixel is the screen pixel, so it is converted out of frame units
	// by the same scale the context applies.
	maskCtx.lineWidth = (padding * 2) / ((scaleX + scaleY) / 2);

	for (let i = 0; i < paths.length; i += 1) {
		const level = levels[i] ?? 0;
		if (level <= 0) continue;
		maskCtx.globalAlpha = level;
		maskCtx.fill(paths[i]);
		// The SVG puts the level on the *group's* opacity so fill and stroke
		// composite as one; canvas has no equivalent, so a region caught
		// mid-fade gets a slightly brighter rim where the stroke's inner half
		// doubles up. It is one padding-pixel wide and lasts one `fadeMs`, and
		// buying it back would cost a full-canvas pass per distinct level.
		if (padding > 0) maskCtx.stroke(paths[i]);
	}
	maskCtx.globalAlpha = 1;

	const litCtx = lit.getContext('2d');
	litCtx.setTransform(1, 0, 0, 1, 0, 0);
	litCtx.globalCompositeOperation = 'source-over';
	litCtx.clearRect(0, 0, lit.width, lit.height);
	litCtx.drawImage(active, 0, 0, lit.width, lit.height);
	litCtx.globalCompositeOperation = 'destination-in';
	litCtx.drawImage(mask, 0, 0);

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.drawImage(lit, 0, 0);
}

/**
 * Steps the displayed levels toward the animation's levels the way the stage's
 * CSS `transition: opacity var(--fade)` does.
 *
 * Without this, an export of a Fade would snap every window on while the stage
 * cross-faded them — the difference between the two renderers most likely to
 * be noticed. It is an approximation: CSS restarts its transition from the
 * current value over a *fixed* duration, so a level that reverses mid-fade
 * takes slightly longer here. For 0-to-1 flips, which is all a transition step
 * ever produces, the two agree.
 */
function approachLevels(displayed, targets, fadeMs, dtMs) {
	const stepSize = fadeMs > 0 ? dtMs / fadeMs : Infinity;
	return targets.map((target, i) => {
		const current = displayed[i] ?? 0;
		const delta = target - current;
		if (Math.abs(delta) <= stepSize) return target;
		return current + Math.sign(delta) * stepSize;
	});
}

/**
 * Records one full pass of the animation sequence.
 *
 * The recording runs in **real time** — `MediaRecorder` captures a live canvas
 * stream, so a six-second sequence takes six seconds to record. That is the
 * price of using the browser's own encoder rather than shipping one.
 *
 * Resolves `{ blob, extension, durationMs }`. Throws with a readable message
 * when there is nothing to record, or when the sequence is longer than
 * `settings.maxVideoSeconds` — better than appearing to hang for five minutes.
 */
export async function exportAnimationVideo({
	base,
	active,
	frame,
	regions,
	steps,
	layout,
	fadeMs = 0,
	regionPaddingPx = 0,
	scale = 1,
	onProgress
}) {
	if (typeof MediaRecorder === 'undefined') {
		throw new Error("This browser can't record video.");
	}
	const durationMs = totalDuration(steps);
	if (!frame || !base?.url || !active?.url || !regions.length || durationMs <= 0) {
		throw new Error('There is no animation to record yet.');
	}
	if (durationMs > settings.maxVideoSeconds * 1000) {
		throw new Error(
			`The sequence runs ${Math.round(durationMs / 1000)}s; recording happens in real time and is capped at ${settings.maxVideoSeconds}s.`
		);
	}

	const mimeType = pickVideoType();
	// The base image's own pixels are the natural output size; the cap keeps a
	// large source from handing the encoder something it will struggle with.
	const nativeWidth = base.naturalWidth || frame.width;
	const nativeHeight = base.naturalHeight || frame.height;
	const capped = Math.min(
		scale,
		settings.maxVideoDimension / Math.max(nativeWidth, nativeHeight)
	);
	const width = Math.max(2, Math.round(nativeWidth * capped));
	const height = Math.max(2, Math.round(nativeHeight * capped));

	const surface = (w, h) => {
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		return canvas;
	};
	const out = surface(width, height);
	const ctx = out.getContext('2d');
	const maskCanvas = surface(width, height);
	const litCanvas = surface(width, height);

	const [baseImage, activeImage] = await Promise.all([loadImage(base.url), loadImage(active.url)]);
	const paths = buildPaths(regions);

	const stream = out.captureStream();
	const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
	const chunks = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	const stopped = new Promise((resolve) => {
		recorder.onstop = resolve;
	});

	// The opening frame is drawn before recording starts, so the first captured
	// frame is the scene at t=0 rather than a blank canvas.
	let displayed = layout.points.map(() => 0);
	const draw = (levels) =>
		drawFrame({
			ctx,
			base: baseImage,
			active: activeImage,
			mask: maskCanvas,
			lit: litCanvas,
			paths,
			levels,
			frame,
			padding: regionPaddingPx
		});
	draw(displayed);
	recorder.start();

	const start = performance.now();
	let previous = start;
	await new Promise((resolve) => {
		const tick = (now) => {
			const elapsed = Math.min(now - start, durationMs);
			// `loop: false` is what makes this one pass: the last frame holds on
			// the sequence's end instead of wrapping back to its opening.
			const targets = sequenceLevels(steps, layout, elapsed, { loop: false });
			displayed = approachLevels(displayed, targets, fadeMs, now - previous);
			previous = now;
			draw(displayed);
			onProgress?.(elapsed / durationMs);
			if (elapsed >= durationMs) resolve();
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	recorder.stop();
	await stopped;
	return {
		blob: new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }),
		extension: mimeType.includes('mp4') ? 'mp4' : 'webm',
		durationMs
	};
}
