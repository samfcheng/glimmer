<script>
	/**
	 * A value that reads as text until you interact with it: click to type,
	 * or — when `onScrub` is supplied — click and drag sideways to adjust it
	 * the way Figma and Blender do.
	 */
	let {
		/** The formatted text to show. */
		text,
		/** Called with the raw typed string when an edit is committed. */
		onCommit,
		/** Called once, when a scrub drag is confirmed. Snapshot your value here. */
		onScrubStart = null,
		/** Called with the *total* dx since the drag began. Omit to disable scrubbing. */
		onScrub = null,
		disabled = false,
		/** Width of the field in px — widen it for values that need the room. */
		width = 56
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let inputEl = $state();
	let displayEl = $state();

	// Drag-vs-click: a pointerdown starts a *candidate* drag, which only turns
	// into an actual scrub (and suppresses the click that would otherwise enter
	// edit mode) once the pointer has moved past a small threshold. Without
	// that, every scrub would also drop you into a text field on release.
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
		// Total delta since drag start, not incremental: the parent recomputes
		// fresh from its own pre-drag snapshot each time, which stops rounding
		// error from accumulating across a long drag.
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
		style:width="{width}px"
		bind:value={draft}
		onblur={commit}
		onkeydown={handleKeydown}
	/>
{:else}
	<button
		type="button"
		class="value-display"
		class:scrubbable={!!onScrub}
		style:width="{width}px"
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
		/* An explicit width, not min-width: a bare <input> defaults to an
		   intrinsic ~20ch regardless of min-width, which would jog the whole
		   row wider the moment you click to edit. */
		height: 24px;
		font: inherit;
		font-size: var(--editor-control-font-size);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-align: right;
		padding: 1px 6px;
		border: 1px solid transparent;
		border-radius: var(--editor-radius-sm);
		line-height: normal;
		background: var(--editor-color-input-bg);
		color: var(--editor-color-text);
	}

	.value-display {
		cursor: text;
		overflow: hidden;
	}

	.value-display.scrubbable {
		cursor: ew-resize;
		/* A horizontal scrub shouldn't leave a text selection behind it. */
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
	}

	.value-display:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.value-input {
		border-color: var(--editor-color-accent);
		margin: 0;
	}

	.value-input:focus {
		outline: none;
	}
</style>
