<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import DemosSection from './DemosSection.svelte';
	import ImagesSection from './ImagesSection.svelte';
	import RegionsSection from './RegionsSection.svelte';
	import ModeSection from './ModeSection.svelte';
	import InteractiveSection from './InteractiveSection.svelte';
	import WavesSection from './WavesSection.svelte';
	import MusicSection from './MusicSection.svelte';
	import AnimationSection from './AnimationSection.svelte';
	import ExportSection from './ExportSection.svelte';
	import AppearanceSection from './AppearanceSection.svelte';
	import DebugSection from './DebugSection.svelte';

	const app = getAppState();
</script>

<!--
	With nothing loaded, the only useful controls are the ones that get an image
	on the stage — so the effect sections stay out until there is something for
	them to act on, and the demos take their place at the top. Appearance stays
	either way: it carries the theme, which is a preference, not scene state.
-->
<aside class="sidebar" class:hidden={!app.sidebarOpen}>
	{#if !app.hasImage}
		<DemosSection />
	{/if}
	<ImagesSection />
	<RegionsSection />
	{#if app.hasImage}
		<ModeSection />
		<InteractiveSection />
		<WavesSection />
		<MusicSection />
		<AnimationSection />
		<ExportSection />
	{/if}
	<AppearanceSection />
	{#if app.hasImage}
		<DebugSection />
	{/if}
</aside>

<style>
	.sidebar {
		width: 280px;
		flex-shrink: 0;
		height: 100%;
		overflow-y: auto;
		background: var(--color-panel);
		border-left: 1px solid var(--color-panel-border);
		/* Breathing room so the last section never sits flush against the
		   bottom of the viewport when the panel is scrolled to the end. */
		padding-bottom: 2rem;
	}

	.sidebar > :global(section:first-child) {
		border-top: none;
	}

	/* Collapsing gives the space back to the stage rather than just hiding in
	   place, so the image genuinely fills the window and "R" fits to all of
	   it. Kept mounted (not removed) so scroll position and any open section
	   survive the toggle. */
	.sidebar.hidden {
		width: 0;
		padding: 0;
		border: none;
		overflow: hidden;
		pointer-events: none;
	}
</style>
