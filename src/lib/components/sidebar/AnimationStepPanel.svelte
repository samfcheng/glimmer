<script>
	import { settings } from '$lib/config/settings.js';
	import { ANIMATION_KINDS, DIRECTIONS, EASINGS, kindSpec } from '$lib/light/animation.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Select from '../ui/Select.svelte';
	import Slider from '../ui/Slider.svelte';
	import SegmentedToggle from '../ui/SegmentedToggle.svelte';
	import Toggle from '../ui/Toggle.svelte';

	let { step, onKindChange } = $props();

	let spec = $derived(kindSpec(step.kind));

	// Every animation's own controls are declared as data in `animation.js`, so
	// this panel renders whatever the chosen kind asks for and adding an
	// animation stays a one-file change. `format` names a display pair rather
	// than carrying a function, so a step survives the round trip through a
	// demo's `settings.json`.
	const FORMATS = {
		percent: { format: formatPercent, parse: parsePercent },
		degrees: { format: (v) => `${Math.round(v)}°`, parse: (text) => parseFloat(text) },
		count: { format: (v) => String(v), parse: (text) => parseFloat(text) },
		rate: { format: (v) => `${v}/s`, parse: (text) => parseFloat(text) }
	};
	const formatFor = (name) => FORMATS[name] ?? FORMATS.count;

	function formatDuration(ms) {
		return ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${Math.round(ms)}ms`;
	}

	function parseDuration(text) {
		const value = parseFloat(text);
		return /s\s*$/i.test(text.trim()) && !/ms\s*$/i.test(text.trim()) ? value * 1000 : value;
	}
</script>

<div class="panel">
	<!--
		Switching the kind rebuilds the step rather than writing `step.kind`, so
		the options come out as the new pattern's defaults instead of leftovers
		from the old one — hence a function binding rather than `bind:value`.
	-->
	<Select
		label="Animation"
		info={spec.hint}
		bind:value={() => step.kind, onKindChange}
		options={ANIMATION_KINDS}
	/>

	<Slider
		label="Duration"
		bind:value={step.durationMs}
		min={settings.stepDuration.min}
		max={settings.stepDuration.max}
		step={settings.stepDuration.step}
		formatValue={formatDuration}
		parseValue={parseDuration}
	/>

	<!--
		Direction, Scatter and Easing belong to the *transition* machinery, not
		to any one pattern, so they sit above the kind's own controls and the
		sustained kinds (Hold, Twinkle, Chase, Strobe) don't get them at all —
		there is no front to order and no target to arrive at.
	-->
	{#if !spec.sustained}
		<SegmentedToggle label="Direction" bind:value={step.direction} options={DIRECTIONS} />
	{/if}

	{#each spec.controls as control (control.key)}
		{#if control.type === 'slider'}
			<Slider
				label={control.label}
				bind:value={step.options[control.key]}
				min={control.min}
				max={control.max}
				step={control.step}
				formatValue={formatFor(control.format).format}
				parseValue={formatFor(control.format).parse}
			/>
		{:else if control.type === 'select'}
			<Select label={control.label} bind:value={step.options[control.key]} options={control.options} />
		{:else if control.type === 'toggle'}
			<Toggle
				label={control.label}
				info={control.hint || null}
				bind:checked={step.options[control.key]}
			/>
		{/if}
	{/each}

	<!-- Fade's order already *is* the threshold, so blending more of it in
	     would be a no-op — `randomOrder` is what opts a kind out. -->
	{#if !spec.sustained && !spec.randomOrder}
		<Slider
			label="Scatter"
			info="Blends the pattern's order toward each window's own fixed random number: 0 is a ruler-straight front, turned up it frays into a scattered one that stays frayed the same way frame after frame."
			bind:value={step.scatter}
			min={settings.scatter.min}
			max={settings.scatter.max}
			step={settings.scatter.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
	{/if}

	{#if !spec.sustained}
		<Select
			label="Easing"
			info="Shapes how fast the front travels across the scene. The cross-fade of one window is Appearance's Fade, which is a separate thing."
			bind:value={step.easing}
			options={EASINGS}
		/>
	{/if}
</div>

<style>
	/* Indented and ruled off so an open panel reads as belonging to the row
	   above it rather than as the next row's settings. */
	.panel {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 2px 0 8px 10px;
		padding-left: 10px;
		border-left: 1px solid var(--color-panel-border);
	}
</style>
