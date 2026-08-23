<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { computeFitTransform, screenToFrame } from '$lib/geometry/transform.js';
	import { easeToward, interactiveLevels, levelsMatch } from '$lib/light/interactive.js';
	import { waveCoordinates, waveLevels } from '$lib/light/waves.js';
	import { sequenceLevels } from '$lib/light/animation.js';
	import { frameDelta } from '$lib/light/clock.js';
	import Scene from './Scene.svelte';
	import CursorCircle from './CursorCircle.svelte';
	import FloatingToolbar from '../toolbar/FloatingToolbar.svelte';

	const app = getAppState();

	let stageEl = $state();
	let containerWidth = $state(0);
	let containerHeight = $state(0);

	// --- View transform: a fit-to-container base with the user's pan/zoom
	// layered on top, so "reset" is just clearing the latter.
	let zoomFactor = $state(1);
	let panX = $state(0);
	let panY = $state(0);

	let baseTransform = $derived(
		computeFitTransform(containerWidth, containerHeight, app.frame, settings.fitPaddingPx)
	);
	let transform = $derived({
		scale: baseTransform.scale * zoomFactor,
		offsetX: baseTransform.offsetX + panX,
		offsetY: baseTransform.offsetY + panY
	});

	function resetView() {
		zoomFactor = 1;
		panX = 0;
		panY = 0;
	}

	// A newly loaded scene starts fit to the view rather than keeping whatever
	// pan/zoom was dialled into the previous one.
	$effect(() => {
		app.base.url;
		app.svg.viewBox;
		resetView();
	});

	function toFramePoint(clientX, clientY) {
		const rect = stageEl.getBoundingClientRect();
		return screenToFrame(
			{ x: clientX - rect.left, y: clientY - rect.top },
			transform,
			app.frame ?? { x: 0, y: 0, width: 1, height: 1 }
		);
	}

	// --- Lighting -------------------------------------------------------
	// Random mode is pure derivation, so an effect keeps it in step with the
	// seed and the slider. Interactive mode needs a clock, so it gets a frame
	// loop instead — and only while that mode is showing.
	$effect(() => {
		if (app.mode !== 'random') return;
		app.litChance;
		app.seed;
		app.regions;
		app.applyRandomLevels();
	});

	// Auto-scramble: a plain interval, since the pattern only has to change on
	// a beat — no frame loop needed. Re-created when the delay changes.
	$effect(() => {
		if (app.mode !== 'random' || !app.autoScramble) return;
		const timer = setInterval(() => app.scramble(), app.scrambleDelayMs);
		return () => clearInterval(timer);
	});

	/** True cursor position in frame units, or null while the pointer is away. */
	let cursorTarget = $state(null);
	/** The eased circle — what actually lights regions. */
	let circle = $state(null);

	$effect(() => {
		if (app.mode !== 'interactive') return;

		let frameId = 0;
		let lastTime = 0;

		const tick = (time) => {
			frameId = requestAnimationFrame(tick);
			const dt = frameDelta(lastTime, time);
			lastTime = time;

			if (cursorTarget) circle = easeToward(circle, cursorTarget, app.responsiveness, dt);

			const next = interactiveLevels(
				app.regions,
				cursorTarget ? circle : null,
				app.radius,
				app.smoothing,
				{ twinkle: app.twinkle }
			);
			// Skipping identical frames keeps a still cursor from re-rendering
			// every region 60 times a second.
			if (!levelsMatch(next, app.levels)) app.levels = next;
		};

		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	});

	// Where each region sits along the wave's travel axis. Derived, not
	// recomputed per frame — it only changes when the scene or direction does.
	let waveCoords = $derived(
		app.mode === 'waves' && app.frame
			? waveCoordinates(app.regions, app.frame, app.waveDirection, {
					x: app.waveCentreX,
					y: app.waveCentreY
				})
			: null
	);

	$effect(() => {
		if (app.mode !== 'waves') return;

		let frameId = 0;
		let lastTime = 0;
		let elapsed = 0;

		const tick = (time) => {
			frameId = requestAnimationFrame(tick);
			const dt = frameDelta(lastTime, time);
			lastTime = time;
			elapsed += dt;

			if (!waveCoords) return;
			const next = waveLevels(waveCoords, app.regions, {
				time: elapsed,
				speed: app.waveSpeed,
				wavelength: app.waveLength,
				band: app.waveBand,
				softness: app.waveSoftness,
				twinkle: app.twinkle
			});
			if (!levelsMatch(next, app.levels)) app.levels = next;
		};

		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	});

	// Animation mode: the same shape again, but the loop only advances a clock
	// — every frame is `sequenceLevels(timeMs)`, a pure lookup. Nothing
	// accumulates, which is what lets the scrubber, a loop restart and the
	// offscreen video export all land on the same picture for the same
	// millisecond.
	$effect(() => {
		if (app.mode !== 'animation') return;

		let frameId = 0;
		let lastTime = 0;

		const tick = (time) => {
			frameId = requestAnimationFrame(tick);
			const dt = frameDelta(lastTime, time);
			lastTime = time;

			if (app.animationPlaying) {
				const advanced = app.animationTimeMs + dt * 1000;
				// A sequence that isn't looping stops on its last frame rather
				// than running the clock on past the end for ever.
				if (!app.animationLoop && advanced >= app.animationDuration) {
					app.animationTimeMs = app.animationDuration;
					app.animationPlaying = false;
				} else {
					// Wrapped rather than left to grow: the scrubber writes an
					// absolute time into the same field, so keeping it inside one
					// pass is what stops the two disagreeing about "now" after the
					// sequence has looped for a while.
					app.animationTimeMs =
						app.animationLoop && app.animationDuration > 0
							? advanced % app.animationDuration
							: advanced;
				}
			}

			const next = sequenceLevels(app.animationSteps, app.animationLayout, app.animationTimeMs, {
				loop: app.animationLoop,
				starts: app.animationStarts,
				arrivals: app.animationArrivals
			});
			if (!levelsMatch(next, app.levels)) app.levels = next;
		};

		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	});

	// --- Pointer: pan on drag, scramble on click ------------------------
	// A press starts a *candidate* pan; it only becomes one past a few pixels
	// of movement. Anything shorter is a click, which is the scramble gesture
	// — so dragging to pan never reshuffles the lights behind it.
	let panPointerId = $state(null);
	let panLastClient = null;
	let panStartClient = null;
	let panConfirmed = $state(false);
	let spaceHeld = $state(false);

	/**
	 * Floating controls sit inside the stage, so a press on one bubbles here
	 * too. Starting a pan on those was swallowing their clicks outright:
	 * `setPointerCapture` retargets the following pointerup to the stage, and
	 * a click whose down and up disagree is never dispatched to the button.
	 */
	function isSceneTarget(target) {
		return !target?.closest?.('[data-stage-ui]');
	}

	function handlePointerDown(event) {
		if (event.button !== 0) return;
		if (!isSceneTarget(event.target)) return;
		panPointerId = event.pointerId;
		panLastClient = { x: event.clientX, y: event.clientY };
		panStartClient = { x: event.clientX, y: event.clientY };
		panConfirmed = false;
		stageEl.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event) {
		if (app.frame) cursorTarget = toFramePoint(event.clientX, event.clientY);

		if (panPointerId !== event.pointerId) return;
		if (!panConfirmed) {
			const dx = event.clientX - panStartClient.x;
			const dy = event.clientY - panStartClient.y;
			if (Math.hypot(dx, dy) <= settings.panClickThresholdPx) return;
			panConfirmed = true;
		}
		panX += event.clientX - panLastClient.x;
		panY += event.clientY - panLastClient.y;
		panLastClient = { x: event.clientX, y: event.clientY };
	}

	function endPan(event) {
		if (panPointerId !== event.pointerId) return;
		if (!panConfirmed && app.mode === 'random' && app.regions.length > 0) app.scramble();
		if (stageEl.hasPointerCapture(event.pointerId)) stageEl.releasePointerCapture(event.pointerId);
		panPointerId = null;
		panLastClient = null;
		panStartClient = null;
		panConfirmed = false;
	}

	function handlePointerLeave() {
		// Everything fades off; the circle keeps its position so coming back in
		// picks up where it left off instead of flying in from the last corner.
		cursorTarget = null;
	}

	// --- Wheel: plain scroll pans, ctrl/cmd+scroll (or a trackpad pinch, which
	// the browser reports as a ctrlKey wheel) zooms toward the cursor.
	function handleWheel(event) {
		event.preventDefault();
		const rect = stageEl.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		if (event.ctrlKey || event.metaKey) {
			const zoomDelta = Math.exp(-event.deltaY * 0.01);
			const nextZoom = Math.min(settings.maxZoom, Math.max(settings.minZoom, zoomFactor * zoomDelta));
			if (nextZoom === zoomFactor) return;
			// Keep the point under the cursor pinned while the scale changes.
			const anchorX = (mouseX - transform.offsetX) / transform.scale;
			const anchorY = (mouseY - transform.offsetY) / transform.scale;
			const nextScale = baseTransform.scale * nextZoom;
			panX = mouseX - anchorX * nextScale - baseTransform.offsetX;
			panY = mouseY - anchorY * nextScale - baseTransform.offsetY;
			zoomFactor = nextZoom;
		} else if (event.shiftKey) {
			panX -= event.deltaY;
		} else {
			panX -= event.deltaX;
			panY -= event.deltaY;
		}
	}

	function isTypingTarget(element) {
		return (
			element &&
			(element.tagName === 'INPUT' ||
				element.tagName === 'SELECT' ||
				element.tagName === 'TEXTAREA')
		);
	}

	function handleKeydown(event) {
		if (isTypingTarget(document.activeElement)) return;
		if (event.code === 'Space') {
			event.preventDefault();
			// In animation mode Space is the transport, the way it is in every
			// video player. Nothing is given up for it: space-pan only ever set
			// the grab cursor — a drag pans in every mode with or without it.
			if (app.mode === 'animation') {
				if (!event.repeat) app.animationPlaying = !app.animationPlaying;
			} else if (!spaceHeld) {
				spaceHeld = true;
			}
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
			event.preventDefault();
			app.sidebarOpen = !app.sidebarOpen;
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === 'r' || event.key === 'R') resetView();
	}

	function handleKeyup(event) {
		if (event.code === 'Space') spaceHeld = false;
	}

	$effect(() => {
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('keyup', handleKeyup);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keyup', handleKeyup);
		};
	});

	// --- Drag and drop: an SVG loads the regions, an image fills the first
	// empty slot (and replaces the default once both are set).
	let isDraggingFile = $state(false);
	let dropError = $state(null);

	function handleDragOver(event) {
		event.preventDefault();
		isDraggingFile = true;
	}

	function handleDragLeave(event) {
		if (event.target === stageEl) isDraggingFile = false;
	}

	async function handleDrop(event) {
		event.preventDefault();
		isDraggingFile = false;
		dropError = null;
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;

		if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
			try {
				app.loadSvg(await file.text(), file.name);
			} catch (error) {
				dropError = error.message;
			}
			return;
		}
		if (file.type.startsWith('image/')) {
			await app.setImage(app.base.url && !app.active.url ? 'active' : 'base', file);
		}
	}

	let emptyMessage = $derived(
		app.loadingDemo
			? 'Loading the demo…'
			: !app.base.url
				? 'Upload a default image to get started'
				: !app.active.url
					? 'Now add the active image — the same scene with its lights on'
					: app.regions.length === 0
						? 'Add an SVG of region paths to light them up'
						: null
	);
</script>

<div
	class="stage"
	class:space-pan={spaceHeld}
	class:panning={panConfirmed}
	bind:this={stageEl}
	bind:clientWidth={containerWidth}
	bind:clientHeight={containerHeight}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={endPan}
	onpointercancel={endPan}
	onpointerleave={handlePointerLeave}
	onwheel={handleWheel}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if app.hasScene}
		<Scene {transform} width={containerWidth} height={containerHeight} />
	{/if}
	{#if app.mode === 'interactive' && app.showCircle && circle && cursorTarget}
		<CursorCircle center={circle} radius={app.radius} {transform} />
	{/if}

	{#if emptyMessage && !isDraggingFile}
		<!-- Suppressed mid-drag so the drop hint is the only prompt on screen. -->
		<div class="empty">{emptyMessage}</div>
	{/if}
	{#if isDraggingFile}
		<div class="drop-hint">Drop an image or an SVG</div>
	{/if}
	{#if dropError}
		<div class="drop-error">{dropError}</div>
	{/if}

	<FloatingToolbar onResetView={resetView} />
</div>

<style>
	.stage {
		position: relative;
		flex: 1;
		height: 100%;
		overflow: hidden;
		background: var(--color-bg);
		/* Without this, a click-drag to pan also starts the browser's native
		   text-selection highlight. */
		user-select: none;
		-webkit-user-select: none;
	}

	.stage.space-pan {
		cursor: grab;
	}

	.stage.panning {
		cursor: grabbing;
	}

	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: 13px;
		pointer-events: none;
	}

	.drop-hint {
		position: absolute;
		inset: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--color-accent);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		color: var(--color-text);
		font-size: 14px;
		font-weight: 500;
		pointer-events: none;
		z-index: 20;
	}

	.drop-error {
		position: absolute;
		left: 50%;
		top: var(--space-lg);
		transform: translateX(-50%);
		padding: 6px 12px;
		border-radius: var(--radius-sm);
		background: var(--color-panel);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		font-size: 12px;
		pointer-events: none;
		z-index: 20;
	}
</style>
