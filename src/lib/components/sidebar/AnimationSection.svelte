<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { kindSpec, stepOffsets, timelineAt } from '$lib/light/animation.js';
	import Section from '../ui/Section.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import AnimationStepPanel from './AnimationStepPanel.svelte';
	import {
		IconChevronDown,
		IconCopy,
		IconPlayerPause,
		IconPlayerPlay,
		IconPlayerSkipBack,
		IconPlus,
		IconRepeat,
		IconRepeatOff,
		IconTrash
	} from '@tabler/icons-svelte-runes';

	const app = getAppState();

	let steps = $derived(app.animationSteps);
	let offsets = $derived(stepOffsets(steps));
	let duration = $derived(app.animationDuration);

	// Which step the playhead is inside — the list highlights it, so the panel
	// you are editing and the thing on screen are visibly the same step.
	let playhead = $derived(timelineAt(steps, app.animationTimeMs, app.animationLoop));
	let activeIndex = $derived(playhead?.index ?? -1);
	let elapsedMs = $derived(
		playhead ? offsets[playhead.index] + playhead.elapsedMs : 0
	);

	const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

	function stepTitle(step) {
		const spec = kindSpec(step.kind);
		return spec.sustained ? spec.label : `${spec.label} ${step.direction}`;
	}

	function toggleOpen(step) {
		if (app.openStepId === step.id) {
			app.openStepId = null;
			return;
		}
		// Editing a step you can't see is guesswork, so opening one scrubs the
		// playhead to its first frame and holds there.
		app.openStepId = step.id;
		app.seekToStep(step.id);
		app.animationPlaying = false;
	}

	// --- Scrubbing ------------------------------------------------------

	let trackEl = $state();
	let scrubPointerId = null;

	function seekFromClientX(clientX) {
		if (!trackEl || duration <= 0) return;
		const rect = trackEl.getBoundingClientRect();
		const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
		app.animationTimeMs = fraction * duration;
	}

	function handleTrackPointerDown(event) {
		if (event.button !== 0 || duration <= 0) return;
		scrubPointerId = event.pointerId;
		// Scrubbing against a running clock fights you for the playhead.
		app.animationPlaying = false;
		trackEl.setPointerCapture(event.pointerId);
		seekFromClientX(event.clientX);
	}

	function handleTrackPointerMove(event) {
		if (scrubPointerId !== event.pointerId) return;
		seekFromClientX(event.clientX);
	}

	function handleTrackPointerUp(event) {
		if (scrubPointerId !== event.pointerId) return;
		if (trackEl.hasPointerCapture(event.pointerId)) trackEl.releasePointerCapture(event.pointerId);
		scrubPointerId = null;
	}

	// --- Drag to reorder ------------------------------------------------
	//
	// Lifted from the particle playground's layers panel, and pointer events
	// for the same reason: native drag-and-drop leaks a translucent row ghost
	// and a link cursor that no browser lets you suppress. Here the drop line
	// is the only feedback, and the drag tracks outside the section for free.

	const DRAG_THRESHOLD_PX = 4;

	let draggingId = $state(null);
	let dropBeforeIndex = $state(null);
	let rowEls = [];
	let press = null;
	let didDrag = false;

	function handleRowPointerDown(event, step) {
		// The chevron, the buttons and the panel below all own their own
		// interactions; only the row's own surface starts a drag.
		if (event.button !== 0 || event.target.closest('button, input, select, .panel-slot')) return;
		press = { pointerId: event.pointerId, startY: event.clientY, id: step.id };
		didDrag = false;
		window.addEventListener('pointermove', handleDragMove);
		window.addEventListener('pointerup', handleDragUp);
		window.addEventListener('pointercancel', handleDragUp);
	}

	function handleDragMove(event) {
		if (!press || event.pointerId !== press.pointerId) return;
		if (!didDrag) {
			if (Math.abs(event.clientY - press.startY) <= DRAG_THRESHOLD_PX) return;
			didDrag = true;
			draggingId = press.id;
		}
		dropBeforeIndex = dropIndexForY(event.clientY);
	}

	function handleDragUp(event) {
		if (!press || event.pointerId !== press.pointerId) return;
		if (didDrag) commitDrop();
		press = null;
		window.removeEventListener('pointermove', handleDragMove);
		window.removeEventListener('pointerup', handleDragUp);
		window.removeEventListener('pointercancel', handleDragUp);
		draggingId = null;
		dropBeforeIndex = null;
	}

	function dropIndexForY(clientY) {
		for (let i = 0; i < steps.length; i += 1) {
			const rect = rowEls[i]?.getBoundingClientRect();
			if (rect && clientY < rect.top + rect.height / 2) return i;
		}
		return steps.length;
	}

	function commitDrop() {
		if (draggingId === null || dropBeforeIndex === null) return;
		const kept = steps.filter((step) => step.id !== draggingId);
		const moved = steps.find((step) => step.id === draggingId);
		const before = steps.slice(0, dropBeforeIndex).filter((step) => step.id !== draggingId).length;
		app.setStepOrder([...kept.slice(0, before), moved, ...kept.slice(before)].map((s) => s.id));
	}

	function handleRowClick(event, step) {
		if (didDrag) return; // the click that trails a reorder shouldn't open a panel
		toggleOpen(step);
	}
</script>

{#snippet addStep()}
	<IconButton title="Add an animation" plain onclick={() => app.addStep()}>
		<IconPlus size={14} />
	</IconButton>
{/snippet}

{#if app.mode === 'animation'}
	<Section
		title="Animation"
		info="Steps play top to bottom from an all-dark scene, each starting from whatever the last one left behind. Drag a row to reorder it."
		action={addStep}
	>
		<!--
			Transport first: it is what you reach for after every edit below it.
			Plain (chrome-free) buttons at the same 14px the rest of the sidebar's
			icons use — a row of filled 32px boxes read as a toolbar bolted into
			a settings panel.
		-->
		<div class="transport">
			<IconButton
				plain
				title={app.animationPlaying ? 'Pause (Space)' : 'Play (Space)'}
				onclick={() => (app.animationPlaying = !app.animationPlaying)}
			>
				{#if app.animationPlaying}
					<IconPlayerPause size={14} />
				{:else}
					<IconPlayerPlay size={14} />
				{/if}
			</IconButton>
			<IconButton plain title="Back to the start" onclick={() => app.restartAnimation()}>
				<IconPlayerSkipBack size={14} />
			</IconButton>
			<IconButton
				plain
				title={app.animationLoop ? 'Looping — click to play once' : 'Playing once — click to loop'}
				onclick={() => (app.animationLoop = !app.animationLoop)}
			>
				{#if app.animationLoop}
					<IconRepeat size={14} />
				{:else}
					<IconRepeatOff size={14} />
				{/if}
			</IconButton>
			<span class="clock">{seconds(elapsedMs)} / {seconds(duration)}</span>
		</div>

		<!--
			The scrubber doubles as the timeline: each step is a segment sized by
			its share of the total, so the shape of the sequence is readable at a
			glance and dragging lands you inside a known step.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="track"
			bind:this={trackEl}
			onpointerdown={handleTrackPointerDown}
			onpointermove={handleTrackPointerMove}
			onpointerup={handleTrackPointerUp}
			onpointercancel={handleTrackPointerUp}
		>
			{#each steps as step, index (step.id)}
				<div
					class="segment"
					class:active={index === activeIndex}
					style:flex-grow={Math.max(step.durationMs, 1)}
					title={stepTitle(step)}
				></div>
			{/each}
			{#if duration > 0}
				<div class="playhead" style:left="{(elapsedMs / duration) * 100}%"></div>
			{/if}
		</div>

		{#if steps.length === 0}
			<p class="empty">No steps yet — add one with the + above.</p>
		{/if}

		<div class="steps">
			{#each steps as step, index (step.id)}
				<div class="step">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="row"
						class:playing={index === activeIndex}
						class:dragging={draggingId === step.id}
						bind:this={rowEls[index]}
						onpointerdown={(event) => handleRowPointerDown(event, step)}
						onclick={(event) => handleRowClick(event, step)}
						role="button"
						tabindex="0"
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								toggleOpen(step);
							}
						}}
					>
						{#if dropBeforeIndex === index}
							<div class="drop-line drop-above"></div>
						{/if}
						{#if index === steps.length - 1 && dropBeforeIndex === steps.length}
							<div class="drop-line drop-below"></div>
						{/if}

						<span class="chevron" class:collapsed={app.openStepId !== step.id}>
							<IconChevronDown size={12} />
						</span>
						<span class="index">{index + 1}</span>
						<span class="name">{stepTitle(step)}</span>
						<span class="meta">{seconds(step.durationMs)}</span>
						<IconButton
							title="Duplicate"
							plain
							onclick={(event) => {
								event.stopPropagation();
								app.duplicateStep(step.id);
							}}
						>
							<IconCopy size={14} />
						</IconButton>
						<IconButton
							title="Remove"
							plain
							onclick={(event) => {
								event.stopPropagation();
								app.removeStep(step.id);
							}}
						>
							<IconTrash size={14} />
						</IconButton>
					</div>

					{#if app.openStepId === step.id}
						<div class="panel-slot">
							<AnimationStepPanel {step} onKindChange={(kind) => app.setStepKind(step.id, kind)} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Section>
{/if}

<style>
	.transport {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) 0;
	}

	/* A chrome-free row still wants a little air around the icons, and the
	   16px plain buttons sit tight together without it. */
	.transport :global(.icon-button) {
		width: 20px;
	}

	.clock {
		margin-left: auto;
		color: var(--color-text-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.track {
		position: relative;
		display: flex;
		gap: 1px;
		height: 14px;
		margin: 2px 0 6px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-track);
		cursor: pointer;
		touch-action: none;
	}

	.segment {
		flex-basis: 0;
		min-width: 2px;
		background: var(--color-track-fill);
	}

	.segment.active {
		background: color-mix(in srgb, var(--color-accent) 60%, transparent);
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--color-text);
		pointer-events: none;
	}

	.empty {
		margin: 4px 0;
		color: var(--color-text-muted);
		font-size: 12px;
	}

	.steps {
		display: flex;
		flex-direction: column;
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		/* Bled out to the panel edges so the hover/active fill reads as a full
		   row rather than a floating pill. */
		margin: 0 calc(-1 * var(--space-md));
		padding: 5px var(--space-md);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
	}

	.row:hover {
		background: var(--color-hover);
	}

	/* The step under the playhead, so what you are editing and what is on
	   screen are visibly the same step. */
	.row.playing {
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}

	.row.dragging {
		opacity: 0.4;
	}

	.drop-line {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--color-accent);
		pointer-events: none;
	}

	.drop-line.drop-above {
		top: -1px;
	}

	.drop-line.drop-below {
		bottom: -1px;
	}

	.chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		color: var(--color-text-muted);
	}

	.chevron.collapsed {
		transform: rotate(-90deg);
	}

	.index {
		width: 12px;
		color: var(--color-text-muted);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
		font-size: 11px;
		line-height: 14px;
		text-transform: capitalize;
	}

	.meta {
		color: var(--color-text-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
