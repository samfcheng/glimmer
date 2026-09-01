<script>
	import { untrack } from 'svelte';
	import './editor.css';
	import Canvas from './Canvas.svelte';
	import Sidebar from './Sidebar.svelte';
	import Toolbar from './Toolbar.svelte';
	import { createEditorState, setEditorState } from './state/editor.svelte.js';

	let {
		/**
		 * The bounds of your scene in its own coordinate system:
		 * `{ x, y, width, height }` — an SVG viewBox, an image's pixel size, a
		 * grid's extent. This is what "fit to view" fits. Null until you have
		 * something to show; the canvas then just shows `emptyMessage`.
		 */
		content = null,

		/** Reuse a state instance you made yourself with `createEditorState()`. */
		state = null,

		sidebarOpen = $bindable(true),
		sidebarWidth = 280,
		sidebarSide = 'right',

		// Left undefined rather than given literal defaults, so that a state
		// instance created with its own options (`<Editor {state}>`) keeps them
		// instead of being silently reset to these. The effective defaults live
		// in one place: EDITOR_DEFAULTS.
		fitPadding = undefined,
		minZoom = undefined,
		maxZoom = undefined,
		/** Refit the view whenever `content`'s dimensions change. */
		autoFit = true,

		enablePan = true,
		enableZoom = true,
		/** Bind R / ⌘\ / space-to-grab on the window. */
		shortcuts = true,

		showToolbar = true,
		showResetView = true,
		showZoom = false,
		showSidebarToggle = true,

		emptyMessage = null,
		dropHint = 'Drop a file',

		onCanvasClick = null,
		onPointerMove = null,
		onDropFiles = null,
		/**
		 * Runs before the built-in shortcuts. Call `event.preventDefault()` to
		 * claim a key for yourself — Space, say, if it's your play/pause.
		 */
		onKeydown = null,

		/** The scene. Receives `{ editor, transform, width, height }`. */
		canvas,
		/** The sidebar's contents — a stack of `<Section>`s, usually.
		 *  Receives `{ editor }`. */
		sidebar = null,
		/** Extra toolbar buttons, rendered ahead of the built-in ones.
		 *  Receives `{ editor }`. */
		toolbar = null
	} = $props();

	// Read once, deliberately: the state object is the identity of this editor,
	// so swapping it mid-life would strand every component that already read it
	// off context. Pass a different one by re-keying the <Editor> instead.
	// svelte-ignore state_referenced_locally
	const editor = state ? setEditorState(state) : createEditorState();

	// Props are pushed into the state rather than read from it, so the state
	// object stays the single source the rest of the tree reads from. The merge
	// is untracked: reading `editor.options` to spread it, inside the same
	// effect that writes it, would otherwise re-trigger the effect for ever.
	$effect(() => {
		const overrides = {};
		if (fitPadding !== undefined) overrides.fitPadding = fitPadding;
		if (minZoom !== undefined) overrides.minZoom = minZoom;
		if (maxZoom !== undefined) overrides.maxZoom = maxZoom;
		untrack(() => {
			editor.options = { ...editor.options, ...overrides };
		});
	});

	$effect(() => {
		editor.content = content;
	});

	// A newly loaded scene starts framed rather than keeping whatever pan/zoom
	// was dialled into the previous one. Keyed on the dimensions, so resizing
	// what you're editing refits but a mere re-render doesn't.
	$effect(() => {
		if (!autoFit) return;
		content?.x;
		content?.y;
		content?.width;
		content?.height;
		editor.resetView();
	});

	// Two-way sync for the convenience binding. Writing an already-equal value
	// is a no-op in Svelte's reactivity, so these settle in one pass instead of
	// ping-ponging.
	$effect(() => {
		editor.sidebarOpen = sidebarOpen;
	});
	$effect(() => {
		sidebarOpen = editor.sidebarOpen;
	});

	function isTypingTarget(element) {
		if (!element) return false;
		return (
			element.tagName === 'INPUT' ||
			element.tagName === 'SELECT' ||
			element.tagName === 'TEXTAREA' ||
			element.isContentEditable
		);
	}

	function handleKeydown(event) {
		onKeydown?.(event);
		if (!shortcuts || event.defaultPrevented) return;
		if (isTypingTarget(document.activeElement)) return;

		// ⌘\ / Ctrl+\ — show and hide the whole control surface.
		if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
			event.preventDefault();
			editor.toggleSidebar();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.code === 'Space') {
			// Held space only sets the grab cursor: a drag pans with or without
			// it, so nothing is lost if you claim Space in `onKeydown`.
			event.preventDefault();
			editor.spaceHeld = true;
			return;
		}
		if (event.key === 'r' || event.key === 'R') editor.resetView();
	}

	function handleKeyup(event) {
		if (event.code === 'Space') editor.spaceHeld = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div class="editor" class:sidebar-left={sidebarSide === 'left'}>
	<!--
		Snippets are values, so they're forwarded by reference rather than
		re-wrapped. Passing `null` through is what lets Canvas and Toolbar tell
		"nothing was provided" from "an empty snippet was provided".
	-->
	<Canvas
		children={canvasContent}
		overlay={showToolbar ? toolbarOverlay : null}
		{emptyMessage}
		{dropHint}
		{enablePan}
		{enableZoom}
		{onCanvasClick}
		{onPointerMove}
		{onDropFiles}
	/>

	{#if sidebar}
		<Sidebar side={sidebarSide} width={sidebarWidth} children={sidebarContent} />
	{/if}
</div>

<!--
	Each snippet is handed the state as well as its own arguments. Components you
	render inside them can also reach it with `getEditorState()` — context
	resolves through the render tree — but a page that just wants to read the
	zoom shouldn't have to make a component to do it.
-->
{#snippet canvasContent(view)}
	{@render canvas({ ...view, editor })}
{/snippet}

{#snippet sidebarContent()}
	{@render sidebar({ editor })}
{/snippet}

{#snippet toolbarOverlay()}
	<Toolbar children={toolbar ? toolbarContent : null} {showResetView} {showZoom} {showSidebarToggle} {sidebarSide} />
{/snippet}

{#snippet toolbarContent()}
	{@render toolbar({ editor })}
{/snippet}

<style>
	.editor {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	/* The canvas is always first in the DOM so it keeps the tab order; a
	   left-hand sidebar is a visual reorder only. */
	.editor.sidebar-left {
		flex-direction: row-reverse;
	}
</style>
