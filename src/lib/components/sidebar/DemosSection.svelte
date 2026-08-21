<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { demos } from '$lib/config/demos.js';
	import Section from '../ui/Section.svelte';
	import { IconSparkles } from '@tabler/icons-svelte-runes';

	const app = getAppState();
</script>

<!-- A way in for anyone who hasn't got two images and an SVG to hand. The
     sidebar drops this section once a scene is loaded — see Sidebar.svelte. -->
<Section title="Demos">
	{#each demos as demo (demo.slug)}
		<button
			type="button"
			class="button demo"
			disabled={app.loadingDemo !== null}
			onclick={() => app.loadDemo(demo.slug)}
		>
			<IconSparkles size={12} />
			{app.loadingDemo === demo.slug ? 'Loading…' : demo.label}
		</button>
	{/each}

	{#if app.demoError}
		<p class="error">{app.demoError}</p>
	{/if}
</Section>

<style>
	.demo + .demo {
		margin-top: 6px;
	}

	.error {
		margin: 8px 0 0;
		color: var(--color-danger);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
