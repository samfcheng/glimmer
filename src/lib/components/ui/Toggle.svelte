<script>
	import InfoTip from './InfoTip.svelte';
	import { Switch } from 'bits-ui';

	let {
		label,
		checked = $bindable(false),
		// Optional one-line explanation, shown behind an "i" beside the label.
		info = null
	} = $props();
</script>

<label class="row">
	<span class="label label-with-info">
		{label}
		{#if info}<InfoTip text={info} />{/if}
	</span>
	<Switch.Root bind:checked class="switch-root">
		<Switch.Thumb class="switch-thumb" />
	</Switch.Root>
</label>

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
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-xs) 0;
	}

	.label {
		color: var(--color-text);
		font-size: 12px;
	}

	.row :global(.switch-root) {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 999px;
		border: none;
		background: var(--color-panel-border);
		cursor: pointer;
		padding: 2px;
		transition: background-color 0.15s ease;
	}

	.row :global(.switch-root[data-state='checked']) {
		background: var(--color-accent);
	}

	.row :global(.switch-thumb) {
		display: block;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 3px var(--color-thumb-shadow);
		transform: translateX(0);
		transition: transform 0.15s ease;
	}

	.row :global(.switch-root[data-state='checked'] .switch-thumb) {
		transform: translateX(14px);
	}
</style>
