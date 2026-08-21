<script>
	// `onScrub`, if given, turns on Figma/Blender-style click-and-drag
	// scrubbing: pressing on the value and dragging horizontally adjusts it
	// instead of entering text-edit mode. A plain click (no drag past the
	// threshold) still enters text-edit mode as before.
	let { text, onCommit, onScrubStart = null, onScrub = null, disabled = false } = $props();

	let editing = $state(false);
	let draft = $state('');
	let inputEl = $state();
	let displayEl = $state();

	// Drag-vs-click state, same shape as the segment drag-vs-select pattern in
	// PathGroup.svelte: pointerdown starts a *candidate* drag; it only turns
	// into an actual scrub (and suppresses the click that would otherwise
	// enter edit mode) once the pointer has moved past a small threshold.
	let dragPointerId = $state(null);
	let dragStartX = 0;
	let dragConfirmed = false;
	let suppressClick = false;
	const DRAG_CLICK_THRESHOLD_PX = 3;

	function startEdit() {
		if (disabled) return;
		draft = text;
		editing = true;
	}

	function commit() {
		editing = false;
		onCommit(draft);
	}

	function handleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			inputEl.blur();
		} else if (event.key === 'Escape') {
			editing = false;
		}
	}

	function handlePointerDown(event) {
		if (disabled || !onScrub || event.button !== 0) return;
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragConfirmed = false;
		displayEl.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event) {
		if (dragPointerId !== event.pointerId) return;
		const dx = event.clientX - dragStartX;
		if (!dragConfirmed) {
			if (Math.abs(dx) < DRAG_CLICK_THRESHOLD_PX) return;
			dragConfirmed = true;
			suppressClick = true;
			onScrubStart?.();
		}
		// Total delta since drag start (not incremental) — the parent
		// recomputes its value fresh from its own pre-drag snapshot each time,
		// which avoids any rounding drift from accumulating small per-move
		// deltas over a long drag.
		onScrub(dx);
	}

	function handlePointerUp(event) {
		if (dragPointerId !== event.pointerId) return;
		displayEl.releasePointerCapture(event.pointerId);
		dragPointerId = null;
		dragConfirmed = false;
	}

	function handleClick() {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		startEdit();
	}

	$effect(() => {
		if (editing && inputEl) {
			inputEl.focus();
			inputEl.select();
		}
	});
</script>

{#if editing}
	<input
		bind:this={inputEl}
		class="value-input"
		bind:value={draft}
		onblur={commit}
		onkeydown={handleKeydown}
	/>
{:else}
	<button
		type="button"
		class="value-display"
		class:scrubbable={!!onScrub}
		bind:this={displayEl}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		onclick={handleClick}
		{disabled}>{text}</button
	>
{/if}

<style>
	.value-display,
	.value-input {
		box-sizing: border-box;
		display: inline-block;
		/* `width` (not min-width) — a bare <input> defaults to an intrinsic
		   ~20ch regardless of min-width, which would otherwise widen the row
		   the moment you click to edit. */
		width: 56px;
		height: 24px;
		font: inherit;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-align: right;
		padding: 1px 6px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		line-height: normal;
		background: var(--color-input-bg);
		color: var(--color-text);
	}

	.value-display {
		cursor: text;
		overflow: hidden;
	}

	.value-display.scrubbable {
		cursor: ew-resize;
		/* A horizontal scrub drag shouldn't leave a text selection behind. */
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
	}

	.value-display:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.value-input {
		border-color: var(--color-accent);
		margin: 0;
	}

	.value-input:focus {
		outline: none;
	}
</style>
