<script>
	let {
		label,
		value = $bindable(),
		/** `[{ value, label }]`. Two or three choices; past that use Select. */
		options = [],
		disabled = false,
		onValueChange = null
	} = $props();

	// Unique per instance so two toggles that happen to share a label can't
	// end up cross-wiring their group labelling.
	const labelId = $props.id();

	function select(optionValue) {
		if (disabled || optionValue === value) return;
		value = optionValue;
		onValueChange?.(optionValue);
	}
</script>

<div class="row" class:disabled>
	<span class="label" id={labelId}>{label}</span>
	<div class="group" role="group" aria-labelledby={labelId}>
		{#each options as option (String(option.value))}
			<button
				type="button"
				class="option"
				class:active={option.value === value}
				aria-pressed={option.value === value}
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
		padding: var(--editor-space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
	}

	.label {
		color: var(--editor-color-text);
		font-size: var(--editor-control-font-size);
	}

	.group {
		display: flex;
		width: 100%;
		background: var(--editor-color-toggle-group-bg);
		border-radius: var(--editor-radius-sm);
		padding: 1px;
		gap: 1px;
	}

	.option {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		border-radius: 5px;
		padding: 3px 0;
		font-family: inherit;
		font-size: var(--editor-control-font-size);
		font-weight: 500;
		text-align: center;
		color: var(--editor-color-text-dim);
		cursor: pointer;
	}

	.option:disabled {
		cursor: default;
	}

	.option.active {
		background: var(--editor-color-toggle-active-bg);
		color: var(--editor-color-text);
	}
</style>
