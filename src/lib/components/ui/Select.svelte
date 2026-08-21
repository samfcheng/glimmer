<script>
	let { label, value = $bindable(), options = [], disabled = false } = $props();
</script>

<div class="row" class:disabled>
	<span class="label">{label}</span>
	<select class="select" bind:value {disabled}>
		{#each options as option (String(option.value))}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</div>

<style>
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
