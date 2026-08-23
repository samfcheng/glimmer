<script>
	import InfoTip from './InfoTip.svelte';
	import { Slider } from 'bits-ui';
	import EditableValue from './EditableValue.svelte';

	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		// A typed value is clamped against this instead of `max` when given —
		// lets the track/drag range stay at the normal `max` while still
		// accepting a deliberately higher typed override (e.g. density/size).
		typedMax = max,
		disabled = false,
		formatValue = (v) => v,
		// Inverse of `formatValue` — e.g. for a slider displayed as "30%" but
		// stored as 0.3, this should turn typed text back into the 0.3 scale.
		parseValue = (text) => parseFloat(text),
		onValueChange = null,
		// Optional one-line explanation, shown behind an "i" beside the label.
		info = null
	} = $props();

	function handleValueChange(next) {
		value = next[0];
		onValueChange?.(next[0]);
	}

	function commitTypedValue(raw) {
		const parsed = parseValue(raw);
		if (Number.isNaN(parsed)) return;
		const clamped = Math.min(typedMax, Math.max(min, parsed));
		value = clamped;
		onValueChange?.(clamped);
	}

	// Figma/Blender-style scrub: click-drag on the value itself (not just the
	// track) adjusts it, 1px of drag per `step` — snapshot the pre-drag value
	// once so every move recomputes fresh from `dragBaseValue`, never from an
	// already-rounded intermediate (which would drift/stick over a long drag).
	let dragBaseValue = 0;

	function handleScrubStart() {
		dragBaseValue = value;
	}

	function handleScrub(totalDx) {
		const raw = dragBaseValue + totalDx * step;
		const stepped = Math.round((raw - min) / step) * step + min;
		const clamped = Math.min(max, Math.max(min, stepped));
		value = clamped;
		onValueChange?.(clamped);
	}
</script>

<div class="row" class:disabled>
	<div class="row-header">
		<span class="label label-with-info">
			{label}
			{#if info}<InfoTip text={info} />{/if}
		</span>
		<EditableValue
			text={formatValue(value)}
			onCommit={commitTypedValue}
			onScrubStart={handleScrubStart}
			onScrub={handleScrub}
			{disabled}
		/>
	</div>
	<Slider.Root
		type="multiple"
		value={[Math.min(value, max)]}
		onValueChange={handleValueChange}
		{min}
		{max}
		{step}
		{disabled}
		class="slider-root"
	>
		{#snippet children({ thumbItems })}
			<span class="slider-track">
				<Slider.Range class="slider-range" />
			</span>
			{#each thumbItems as { index } (index)}
				<Slider.Thumb {index} class="slider-thumb" />
			{/each}
		{/snippet}
	</Slider.Root>
</div>

<style>
	/* Label plus its optional info icon, so the icon sits with the text rather
	   than floating at the end of the row. */
	.label-with-info {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.row {
		padding: var(--space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
	}

	.row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.label {
		color: var(--color-text);
		font-size: 12px;
	}

	.row :global(.slider-root) {
		position: relative;
		display: flex;
		align-items: center;
		height: 24px;
		touch-action: none;
		user-select: none;
	}

	.slider-track {
		position: relative;
		width: 100%;
		height: 12px;
		border-radius: var(--radius-sm);
		background: var(--color-track);
		overflow: hidden;
	}

	.row :global(.slider-range) {
		position: absolute;
		height: 100%;
		background: var(--color-track-fill);
	}

	.row :global(.slider-thumb) {
		display: block;
		width: 12px;
		height: 12px;
		border-radius: var(--radius-sm);
		background: var(--color-thumb);
		/* Transparent in dark mode; in light mode it keeps the white thumb
		   visible against the near-white panel. */
		box-shadow: 0 1px 3px var(--color-thumb-shadow);
		cursor: pointer;
	}
</style>
