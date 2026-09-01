<script>
	/**
	 * Full-width text button for panel sections — the component form of the
	 * `.editor-button` utility class. Wrap several in a
	 * `<div class="editor-button-row">` to sit them side by side.
	 */
	let {
		onclick = () => {},
		disabled = false,
		/** Renders in the accent-danger colour, for destructive actions. */
		danger = false,
		/** Held-down look, for a button that reflects an on/off state. */
		active = false,
		title = undefined,
		children
	} = $props();
</script>

<button
	type="button"
	class="editor-button"
	class:is-danger={danger}
	class:is-active={active}
	{title}
	{disabled}
	{onclick}
>
	{@render children()}
</button>
