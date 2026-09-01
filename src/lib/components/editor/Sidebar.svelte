<script>
	import { getEditorState } from './state/editor.svelte.js';

	let {
		/** Which edge it sits on. Only affects which border it draws. */
		side = 'right',
		width = 280,
		children
	} = $props();

	const editor = getEditorState();
</script>

<!--
	Collapsing gives the space back to the canvas rather than just hiding in
	place, so the content genuinely fills the window and a refit uses all of it.
	The panel stays mounted (width 0, not removed) so scroll position and any
	open section survive the toggle.
-->
<aside
	class="sidebar"
	class:hidden={!editor.sidebarOpen}
	class:left={side === 'left'}
	style:--sidebar-width="{width}px"
	inert={!editor.sidebarOpen}
>
	<div class="inner" style:width="{width}px">
		{@render children()}
	</div>
</aside>

<style>
	.sidebar {
		width: var(--sidebar-width);
		flex-shrink: 0;
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--editor-color-panel);
		border-left: 1px solid var(--editor-color-panel-border);
		transition: width var(--editor-sidebar-duration) ease;
	}

	.sidebar.left {
		border-left: none;
		border-right: 1px solid var(--editor-color-panel-border);
	}

	.sidebar.hidden {
		width: 0;
		border: none;
		pointer-events: none;
	}

	/* The content keeps its full width while the wrapper animates to zero, so
	   the sections slide out of view instead of reflowing narrower on the way. */
	.inner {
		/* Breathing room so the last section never sits flush against the
		   bottom of the viewport when the panel is scrolled to the end. */
		padding-bottom: 2rem;
	}

	.inner > :global(section:first-child) {
		border-top: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.sidebar {
			transition: none;
		}
	}
</style>
