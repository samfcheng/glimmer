<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { MODES, settings } from '$lib/config/settings.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Section from '../ui/Section.svelte';
	import Slider from '../ui/Slider.svelte';
	import Select from '../ui/Select.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import { IconDice5 } from '@tabler/icons-svelte-runes';

	const app = getAppState();
</script>

<!--
	A dropdown rather than the segmented toggle the other three modes shipped
	with: four segments already crowd a 280px panel, and the list is the sort of
	thing that grows.
-->
<Section title="Mode">
	<Select label="Lighting" bind:value={app.mode} options={MODES} />

	{#if app.mode === 'random'}
		<Slider
			label="Lit Chance"
			info="Slides a cut-off through rolls that stay fixed until the next scramble, so raising it lights more windows rather than reshuffling which ones are on."
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
		<Toggle
			label="Animate"
			info="Re-scrambles on a beat. Clicking the image scrambles too — dragging pans instead."
			bind:checked={app.autoScramble}
		/>
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
