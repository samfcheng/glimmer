<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import Section from '../ui/Section.svelte';
	import ImageSlot from './ImageSlot.svelte';

	const app = getAppState();
</script>

<Section title="Images">
	<ImageSlot field="base" label="Default" hint="Lights off" />
	<ImageSlot field="active" label="Active" hint="Lights on" />
	{#each app.mismatches as note (note)}
		<p class="note">{note}</p>
	{/each}
</Section>

<style>
	/* Aspect-ratio mismatches are reported rather than corrected — the images
	   are stretched to the viewBox either way, and knowing why the regions sit
	   slightly off is more useful than a silent adjustment. */
	.note {
		margin: 6px 0 0;
		color: var(--color-text-dim);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
