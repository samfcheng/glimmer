<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Section from '../ui/Section.svelte';
	import Slider from '../ui/Slider.svelte';
	import SegmentedToggle from '../ui/SegmentedToggle.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import { IconDice5 } from '@tabler/icons-svelte-runes';

	const app = getAppState();
</script>

<Section title="Mode">
	<SegmentedToggle
		label="Lighting"
		bind:value={app.mode}
		options={[
			{ value: 'random', label: 'Random' },
			{ value: 'interactive', label: 'Interactive' },
			{ value: 'waves', label: 'Waves' }
		]}
	/>

	{#if app.mode === 'random'}
		<!--
			Lit Chance slides a cut-off through rolls that stay fixed until the
			next scramble, so raising it lights more windows instead of
			reshuffling which ones are on.
		-->
		<Slider
			label="Lit Chance"
			bind:value={app.litChance}
			min={settings.litChance.min}
			max={settings.litChance.max}
			step={settings.litChance.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<button type="button" class="button" onclick={() => app.scramble()}>
			<IconDice5 size={12} />
			Scramble
		</button>
		<p class="hint">Clicking the image scrambles too — dragging pans instead.</p>

		<Toggle label="Animate" bind:checked={app.autoScramble} />
		{#if app.autoScramble}
			<Slider
				label="Delay"
				bind:value={app.scrambleDelayMs}
				min={settings.scrambleDelay.min}
				max={settings.scrambleDelay.max}
				step={settings.scrambleDelay.step}
				formatValue={(v) => `${v}ms`}
			/>
		{/if}
	{/if}
</Section>

<style>
	.hint {
		margin: 8px 0 0;
		color: var(--color-text-dim);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
