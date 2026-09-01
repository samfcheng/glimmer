<script>
	import { getEditorState } from './state/editor.svelte.js';

	let {
		/** Your scene. Receives `{ transform, width, height }` — though most
		 *  content just reads `editor.svgTransform` from context instead. */
		children,
		/** Chrome drawn over the scene (the toolbar, HUDs). Mark anything
		 *  clickable in here with `data-editor-ui` so it doesn't start a pan. */
		overlay = null,
		/** Shown centred when there is nothing to look at yet. */
		emptyMessage = null,

		enablePan = true,
		enableZoom = true,

		/** Called with the content-space point of a click that wasn't a drag. */
		onCanvasClick = null,
		/** Called with the content-space pointer position, or null on leave. */
		onPointerMove = null,
		/** Supplying this turns on file drag-and-drop. */
		onDropFiles = null,
		dropHint = 'Drop a file',
		/** Accessible name for the canvas surface. */
		ariaLabel = 'Editor canvas'
	} = $props();

	const editor = getEditorState();

	let canvasEl = $state();

	function toContentPoint(clientX, clientY) {
		const rect = canvasEl.getBoundingClientRect();
		return editor.toContent(clientX - rect.left, clientY - rect.top);
	}

	// --- Pan: a press starts a *candidate* pan, and only becomes a real one
	// past a few pixels of movement. Anything shorter stays a click, so dragging
	// the canvas around never also fires `onCanvasClick`.
	let panPointerId = null;
	let panLastClient = null;
	let panStartClient = null;

	/**
	 * Floating controls live inside the canvas, so a press on one bubbles here
	 * too. Starting a pan on those swallows their clicks outright:
	 * `setPointerCapture` retargets the following pointerup to the canvas, and
	 * a click whose down and up disagree is never dispatched to the button.
	 */
	function isSceneTarget(target) {
		return !target?.closest?.('[data-editor-ui]');
	}

	function handlePointerDown(event) {
		if (event.button !== 0 || !isSceneTarget(event.target)) return;
		panPointerId = event.pointerId;
		panLastClient = { x: event.clientX, y: event.clientY };
		panStartClient = { x: event.clientX, y: event.clientY };
		editor.panning = false;
		canvasEl.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event) {
		const point = toContentPoint(event.clientX, event.clientY);
		editor.pointer = point;
		onPointerMove?.(point);

		if (panPointerId !== event.pointerId || !enablePan) return;
		if (!editor.panning) {
			const dx = event.clientX - panStartClient.x;
			const dy = event.clientY - panStartClient.y;
			if (Math.hypot(dx, dy) <= editor.options.panClickThresholdPx) return;
			editor.panning = true;
		}
		editor.panBy(event.clientX - panLastClient.x, event.clientY - panLastClient.y);
		panLastClient = { x: event.clientX, y: event.clientY };
	}

	function handlePointerUp(event) {
		if (panPointerId !== event.pointerId) return;
		if (!editor.panning && isSceneTarget(event.target)) {
			onCanvasClick?.(toContentPoint(event.clientX, event.clientY), event);
		}
		if (canvasEl.hasPointerCapture(event.pointerId)) {
			canvasEl.releasePointerCapture(event.pointerId);
		}
		panPointerId = null;
		panLastClient = null;
		panStartClient = null;
		editor.panning = false;
	}

	function handlePointerLeave() {
		editor.pointer = null;
		onPointerMove?.(null);
	}

	/**
	 * Wheel deltas in pixels, whatever unit the browser reported them in.
	 * Firefox sends mouse wheels as *lines* (deltaMode 1) and a page-scroll as
	 * *pages* (deltaMode 2); taking `deltaY` at face value makes the same
	 * gesture move roughly 16x less there than in Chrome.
	 */
	function wheelPixels(event) {
		const factor =
			event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? editor.viewportHeight || 800 : 1;
		return { x: event.deltaX * factor, y: event.deltaY * factor };
	}

	// --- Wheel: plain scroll pans, shift+scroll pans sideways, and ctrl/cmd +
	// scroll zooms toward the cursor. A trackpad pinch arrives as a ctrlKey
	// wheel event, which is why pinch-to-zoom works without extra handling.
	function handleWheel(event) {
		if (!enablePan && !enableZoom) return;
		event.preventDefault();
		const delta = wheelPixels(event);

		if (enableZoom && (event.ctrlKey || event.metaKey)) {
			const { maxWheelDelta, zoomSensitivity } = editor.options;
			const clamped = Math.max(-maxWheelDelta, Math.min(maxWheelDelta, delta.y));
			const rect = canvasEl.getBoundingClientRect();
			editor.zoomBy(Math.exp(-clamped * zoomSensitivity), {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top
			});
			return;
		}
		if (!enablePan) return;
		if (event.shiftKey) {
			editor.panBy(-delta.y, 0);
		} else {
			editor.panBy(-delta.x, -delta.y);
		}
	}

	// --- File drag and drop -------------------------------------------------
	let isDraggingFile = $state(false);

	function handleDragOver(event) {
		if (!onDropFiles) return;
		event.preventDefault();
		isDraggingFile = true;
	}

	function handleDragLeave(event) {
		// Only the canvas itself, or dragging across a child would flicker the
		// hint off and on for every element the pointer crosses.
		if (event.target === canvasEl) isDraggingFile = false;
	}

	function handleDrop(event) {
		if (!onDropFiles) return;
		event.preventDefault();
		isDraggingFile = false;
		const files = Array.from(event.dataTransfer?.files ?? []);
		if (files.length) onDropFiles(files, event);
	}
</script>

<!--
	`role="application"` rather than a bare div: this is a workspace with its own
	pointer and keyboard model (drag to pan, R to refit), so assistive tech
	should hand keys through to it instead of intercepting them for browse mode.
-->
<div
	class="canvas"
	role="application"
	aria-label={ariaLabel}
	class:space-pan={editor.spaceHeld && enablePan}
	class:panning={editor.panning}
	bind:this={canvasEl}
	bind:clientWidth={editor.viewportWidth}
	bind:clientHeight={editor.viewportHeight}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onpointerleave={handlePointerLeave}
	onwheel={handleWheel}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{@render children({
		transform: editor.transform,
		width: editor.viewportWidth,
		height: editor.viewportHeight
	})}

	<!-- Suppressed mid-drag so the drop hint is the only prompt on screen. -->
	{#if emptyMessage && !isDraggingFile}
		<div class="empty">{emptyMessage}</div>
	{/if}
	{#if isDraggingFile}
		<div class="drop-hint">{dropHint}</div>
	{/if}

	{#if overlay}
		{@render overlay()}
	{/if}
</div>

<style>
	.canvas {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
		background: var(--editor-color-bg);
		/* Without this, a click-drag to pan also starts the browser's native
		   text-selection highlight. */
		user-select: none;
		-webkit-user-select: none;
	}

	.canvas.space-pan {
		cursor: grab;
	}

	.canvas.panning {
		cursor: grabbing;
	}

	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--editor-space-lg);
		text-align: center;
		color: var(--editor-color-text-muted);
		font-size: var(--editor-font-size);
		pointer-events: none;
	}

	.drop-hint {
		position: absolute;
		inset: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--editor-color-accent);
		border-radius: var(--editor-radius-md);
		background: color-mix(in srgb, var(--editor-color-accent) 10%, transparent);
		color: var(--editor-color-text);
		font-size: 14px;
		font-weight: 500;
		pointer-events: none;
		z-index: 20;
	}
</style>
