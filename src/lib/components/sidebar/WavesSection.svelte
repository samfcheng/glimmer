<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { WAVE_DIRECTIONS } from '$lib/light/waves.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Section from '../ui/Section.svelte';
	import Select from '../ui/Select.svelte';
	import Slider from '../ui/Slider.svelte';
	import Toggle from '../ui/Toggle.svelte';

	const app = getAppState();
</script>

{#if app.mode === 'waves'}
	<Section title="Waves">
		<Select label="Direction" bind:value={app.waveDirection} options={WAVE_DIRECTIONS} />
		<!-- Only the radial directions have a centre to move. -->
		{#if app.waveDirection === 'out' || app.waveDirection === 'in'}
			<Slider
				label="Centre X"
				bind:value={app.waveCentreX}
				min={settings.waveCentre.min}
				max={settings.waveCentre.max}
				step={settings.waveCentre.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
			<Slider
				label="Centre Y"
				bind:value={app.waveCentreY}
				min={settings.waveCentre.min}
				max={settings.waveCentre.max}
				step={settings.waveCentre.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
		{/if}
		<Slider
			label="Speed"
			bind:value={app.waveSpeed}
			min={settings.waveSpeed.min}
			max={settings.waveSpeed.max}
			step={settings.waveSpeed.step}
			formatValue={(v) => (v === 0 ? 'frozen' : `${v.toFixed(2)}/s`)}
			parseValue={(text) => parseFloat(text)}
		/>
		<!-- Wavelength is the gap between crests; Band is how much of each
		     wave is lit. Together they set how many waves are on screen and
		     how wide each lit stripe is. -->
		<Slider
			label="Wavelength"
			bind:value={app.waveLength}
			min={settings.waveLength.min}
			max={settings.waveLength.max}
			step={settings.waveLength.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<Slider
			label="Band"
			bind:value={app.waveBand}
			min={settings.waveBand.min}
			max={settings.waveBand.max}
			step={settings.waveBand.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<Slider
			label="Softness"
			bind:value={app.waveSoftness}
			min={settings.waveSoftness.min}
			max={settings.waveSoftness.max}
			step={settings.waveSoftness.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<Toggle label="Twinkle" bind:checked={app.twinkle} />
		<p class="hint">
			Wavelength sets how far apart the crests are; Band is the lit share of each one.
		</p>
	</Section>
{/if}

<style>
	.hint {
		margin: 8px 0 0;
		color: var(--color-text-dim);
		font-size: 11px;
		line-height: 1.4;
	}
</style>
