<script>
	import { Slider } from 'bits-ui';
	import EditableValue from './EditableValue.svelte';
	import InfoTip from './InfoTip.svelte';

	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		/**
		 * A *typed* value is clamped against this instead of `max`. Lets the
		 * track and drag range stay at a comfortable `max` while still accepting
		 * a deliberately higher number typed into the field.
		 */
		typedMax = max,
		disabled = false,
		/** Number → display string, e.g. `(v) => `${v}ms`` or a percent. */
		formatValue = (v) => v,
		/** The inverse of `formatValue`: typed text → the stored number. */
		parseValue = (text) => parseFloat(text),
		/** Optional one-line explanation, shown behind an "i" beside the label. */
		info = null,
		onValueChange = null
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

	// Scrubbing the number field: 1px of drag per `step`. The pre-drag value is
	// snapshotted once so every move recomputes fresh from `dragBaseValue`,
	// never from an already-rounded intermediate — which is what would
	// otherwise make a long drag drift or stick.
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
		<span class="label">
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
		class="editor-slider-root"
	>
		{#snippet children({ thumbItems })}
			<span class="slider-track">
				<Slider.Range class="editor-slider-range" />
			</span>
			{#each thumbItems as { index } (index)}
				<Slider.Thumb {index} class="editor-slider-thumb" />
			{/each}
		{/snippet}
	</Slider.Root>
</div>

<style>
	.row {
		padding: var(--editor-space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
	}

	.row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--editor-space-sm);
		margin-bottom: 6px;
	}

	/* The label and its optional info icon travel together, so the icon sits
	   with the text rather than floating at the end of the row. */
	.label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--editor-color-text);
		font-size: var(--editor-control-font-size);
	}

	.row :global(.editor-slider-root) {
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
		border-radius: var(--editor-radius-sm);
		background: var(--editor-color-track);
		overflow: hidden;
	}

	.row :global(.editor-slider-range) {
		position: absolute;
		height: 100%;
		background: var(--editor-color-track-fill);
	}

	.row :global(.editor-slider-thumb) {
		display: block;
		width: 12px;
		height: 12px;
		border-radius: var(--editor-radius-sm);
		background: var(--editor-color-thumb);
		/* Transparent in dark mode; in light mode it's what keeps the white
		   thumb visible against the near-white panel. */
		box-shadow: 0 1px 3px var(--editor-color-thumb-shadow);
		cursor: pointer;
	}

	.row :global(.editor-slider-thumb:focus-visible) {
		outline: 2px solid var(--editor-color-accent);
		outline-offset: 2px;
	}
</style>
