<script>
	import InfoTip from './InfoTip.svelte';
	let {
		label,
		value = $bindable(),
		options = [],
		disabled = false,
		// Optional one-line explanation, shown behind an "i" beside the label.
		info = null
	} = $props();
</script>

<div class="row" class:disabled>
	<span class="label label-with-info">
		{label}
		{#if info}<InfoTip text={info} />{/if}
	</span>
	<select class="select" bind:value {disabled}>
		{#each options as option (String(option.value))}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
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
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: var(--space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
	}

	.label {
		color: var(--color-text);
		font-size: 12px;
	}

	/* The shared `.select` utility sizes the control; it just needs to fill the
	   panel here the way the other inputs do. */
	select {
		width: 100%;
	}
</style>
