<script>
	import {
		IconFocusCentered,
		IconLayoutSidebarLeftCollapse,
		IconLayoutSidebarRightCollapse,
		IconMinus,
		IconPlus
	} from '@tabler/icons-svelte-runes';
	import IconButton from './ui/IconButton.svelte';
	import { getEditorState } from './state/editor.svelte.js';

	let {
		/** Your own buttons, rendered ahead of the built-ins. */
		children = null,
		showResetView = true,
		showZoom = false,
		showSidebarToggle = true,
		sidebarSide = 'right'
	} = $props();

	const editor = getEditorState();

	let zoomLabel = $derived(`${Math.round(editor.zoom * 100)}%`);
	let hasBuiltins = $derived(showResetView || showZoom || showSidebarToggle);
</script>

<!--
	Collapsing the sidebar clears the chrome off the canvas entirely, toolbar
	included, so the content gets the whole window. Anything you put here should
	therefore have a keyboard or pointer equivalent that still works while it is
	hidden — the built-ins do: ⌘/Ctrl+\ brings the sidebar (and the toolbar with
	it) back, and R refits the view.

	`data-editor-ui` is what keeps a press on a button from also starting a pan.
-->
{#if editor.sidebarOpen}
	<div class="toolbar" data-editor-ui>
		{#if children}
			{@render children()}
		{/if}
		{#if children && hasBuiltins}
			<div class="divider"></div>
		{/if}
		{#if showZoom}
			<IconButton title="Zoom out" onclick={() => editor.zoomOut()}>
				<IconMinus size={18} />
			</IconButton>
			<span class="zoom" title="Zoom">{zoomLabel}</span>
			<IconButton title="Zoom in" onclick={() => editor.zoomIn()}>
				<IconPlus size={18} />
			</IconButton>
		{/if}
		{#if showResetView}
			<IconButton title="Reset view (R)" onclick={() => editor.resetView()}>
				<IconFocusCentered size={18} />
			</IconButton>
		{/if}
		{#if showSidebarToggle}
			{#if showResetView || showZoom}
				<div class="divider"></div>
			{/if}
			<IconButton title="Hide controls (⌘\)" onclick={() => (editor.sidebarOpen = false)}>
				{#if sidebarSide === 'left'}
					<IconLayoutSidebarLeftCollapse size={18} />
				{:else}
					<IconLayoutSidebarRightCollapse size={18} />
				{/if}
			</IconButton>
		{/if}
	</div>
{/if}

<style>
	.toolbar {
		position: absolute;
		bottom: var(--editor-space-lg);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--editor-space-sm);
		padding: 4px;
		background: var(--editor-color-panel);
		border: 1px solid var(--editor-color-panel-border);
		border-radius: var(--editor-radius-lg);
		box-shadow: 0 4px 12px var(--editor-color-shadow);
		z-index: 10;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: var(--editor-color-panel-border);
	}

	.zoom {
		min-width: 40px;
		text-align: center;
		color: var(--editor-color-text-muted);
		font-size: var(--editor-control-font-size);
		font-variant-numeric: tabular-nums;
	}
</style>
