<script>
	import InfoTip from './InfoTip.svelte';

	let {
		label,
		value = $bindable(),
		/** `[{ value, label }]`. Values may be any type; they round-trip as-is. */
		options = [],
		disabled = false,
		/** Optional one-line explanation, shown behind an "i" beside the label. */
		info = null,
		onValueChange = null
	} = $props();

	// A dropdown earns its place over SegmentedToggle once there are more than
	// three or four choices, or once the list is the sort of thing that grows.
	function handleChange(event) {
		const next = options[event.currentTarget.selectedIndex]?.value;
		value = next;
		onValueChange?.(next);
	}
</script>

<div class="row" class:disabled>
	<span class="label">
		{label}
		{#if info}<InfoTip text={info} />{/if}
	</span>
	<select class="select" {disabled} onchange={handleChange}>
		{#each options as option (String(option.value))}
			<option value={option.value} selected={option.value === value}>{option.label}</option>
		{/each}
	</select>
</div>

<style>
	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: var(--editor-space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
	}

	.label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--editor-color-text);
		font-size: var(--editor-control-font-size);
	}

	.select {
		width: 100%;
		height: 24px;
		padding: 0 4px;
		border: none;
		border-radius: var(--editor-radius-sm);
		background: var(--editor-color-toggle-group-bg);
		color: var(--editor-color-text);
		font-family: inherit;
		font-size: var(--editor-control-font-size);
		cursor: pointer;
		transition: opacity 0.12s ease;
	}

	.select:hover:not(:disabled) {
		opacity: 0.8;
	}
</style>
