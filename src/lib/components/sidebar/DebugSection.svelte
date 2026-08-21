<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import Section from '../ui/Section.svelte';
	import Slider from '../ui/Slider.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import { settings } from '$lib/config/settings.js';

	const app = getAppState();
</script>

<!-- Overlays for checking the scene rather than presenting it. -->
<Section title="Debug">
	<Toggle label="Show paths" bind:checked={app.showPaths} />
	{#if app.showPaths}
		<Slider
			label="Line width"
			bind:value={app.pathWidth}
			min={settings.pathWidth.min}
			max={settings.pathWidth.max}
			step={settings.pathWidth.step}
			formatValue={(v) => `${v}px`}
		/>
	{/if}
	{#if app.mode === 'interactive'}
		<Toggle label="Show circle" bind:checked={app.showCircle} />
	{/if}
	<p class="hint">Region outlines: red when dark, blue when lit.</p>
</Section>

<style>
	.hint {
		margin: 8px 0 0;
		color: var(--color-text-dim);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
