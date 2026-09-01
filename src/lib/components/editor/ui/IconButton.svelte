<script>
	/** A square icon affordance. Pass the icon as the component's children. */
	let {
		active = false,
		/** Chrome-free variant: 16px, no padding box, no hover background — for
		 *  the small +/×/collapse icons that sit inline in a section header. */
		plain = false,
		title = '',
		disabled = false,
		onclick = () => {},
		children
	} = $props();
</script>

<button
	type="button"
	class="icon-button"
	class:plain
	class:active
	{title}
	{disabled}
	aria-label={title || undefined}
	aria-pressed={active}
	{onclick}
>
	{@render children()}
</button>

<style>
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--editor-radius-sm);
		background: transparent;
		color: var(--editor-color-text-muted);
		cursor: pointer;
	}

	.icon-button :global(svg) {
		flex-shrink: 0;
	}

	/* A translucent wash rather than an opaque colour: these buttons sit on the
	   panel in the sidebar and on the toolbar's own tint inside the canvas, and
	   one flat hover colour reads differently against each. */
	.icon-button:hover:not(:disabled) {
		background: var(--editor-color-hover);
		color: var(--editor-color-text);
	}

	.icon-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.icon-button.active {
		background: var(--editor-color-accent);
		color: var(--editor-color-accent-text);
	}

	.icon-button.plain {
		width: 16px;
		height: 16px;
		background: none;
		color: var(--editor-color-text-muted);
	}

	.icon-button.plain:hover:not(:disabled) {
		background: none;
		color: var(--editor-color-text);
	}
</style>
