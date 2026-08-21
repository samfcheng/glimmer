<script>
	let { label, value = $bindable(), options = [], disabled = false, onValueChange = null } = $props();

	function select(optionValue) {
		if (disabled || optionValue === value) return;
		value = optionValue;
		onValueChange?.(optionValue);
	}
</script>

<div class="row" class:disabled>
	<span class="label">{label}</span>
	<div class="group">
		{#each options as option (String(option.value))}
			<button
				type="button"
				class="option"
				class:active={option.value === value}
				{disabled}
				onclick={() => select(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
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

	.group {
		display: flex;
		width: 100%;
		background: var(--color-toggle-group-bg);
		border-radius: var(--radius-sm);
		padding: 1px;
		gap: 1px;
	}

	.option {
		flex: 1;
		border: none;
		background: none;
		border-radius: 5px;
		padding: 3px 0;
		font-size: 12px;
		font-weight: 500;
		text-align: center;
		color: var(--color-text-dim);
		cursor: pointer;
	}

	.option:disabled {
		cursor: default;
	}

	.option.active {
		background: var(--color-toggle-active-bg);
		color: var(--color-text);
	}
</style>
