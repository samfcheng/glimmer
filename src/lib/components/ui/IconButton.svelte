<script>
	let { active = false, plain = false, title = '', onclick = () => {}, children } = $props();
</script>

<button
	type="button"
	class="icon-button"
	class:plain
	class:active
	{title}
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
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.icon-button :global(svg) {
		flex-shrink: 0;
	}

	.icon-button:hover {
		background: var(--color-panel-border);
		color: var(--color-text);
	}

	.icon-button.active {
		background: var(--color-accent);
		color: var(--color-accent-text);
	}

	/* Small, chrome-free icon affordance (sidebar +/collapse/delete buttons) —
	   no padding box and no hover background, just a color change. */
	.icon-button.plain {
		width: 16px;
		height: 16px;
		background: none;
		color: var(--color-text-muted);
	}

	.icon-button.plain:hover {
		background: none;
		color: var(--color-text);
	}
</style>
