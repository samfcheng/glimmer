<script>
	import { Switch } from 'bits-ui';
	import InfoTip from './InfoTip.svelte';

	let {
		label,
		checked = $bindable(false),
		disabled = false,
		/** Optional one-line explanation, shown behind an "i" beside the label. */
		info = null,
		onCheckedChange = null
	} = $props();
</script>

<label class="row" class:disabled>
	<span class="label">
		{label}
		{#if info}<InfoTip text={info} />{/if}
	</span>
	<Switch.Root bind:checked {disabled} onCheckedChange={onCheckedChange ?? undefined} class="editor-switch-root">
		<Switch.Thumb class="editor-switch-thumb" />
	</Switch.Root>
</label>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--editor-space-sm);
		padding: var(--editor-space-xs) 0;
	}

	.row.disabled {
		opacity: 0.4;
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

	.row :global(.editor-switch-root) {
		position: relative;
		flex-shrink: 0;
		width: 34px;
		height: 20px;
		border-radius: 999px;
		border: none;
		background: var(--editor-color-panel-border);
		cursor: pointer;
		padding: 2px;
		transition: background-color 0.15s ease;
	}

	.row :global(.editor-switch-root[data-state='checked']) {
		background: var(--editor-color-accent);
	}

	.row :global(.editor-switch-root:disabled) {
		cursor: not-allowed;
	}

	.row :global(.editor-switch-thumb) {
		display: block;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px var(--editor-color-thumb-shadow);
		transform: translateX(0);
		transition: transform 0.15s ease;
	}

	.row :global(.editor-switch-root[data-state='checked'] .editor-switch-thumb) {
		transform: translateX(14px);
	}

	@media (prefers-reduced-motion: reduce) {
		.row :global(.editor-switch-root),
		.row :global(.editor-switch-thumb) {
			transition: none;
		}
	}
</style>
