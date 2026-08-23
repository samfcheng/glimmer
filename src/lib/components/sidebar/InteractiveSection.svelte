<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Section from '../ui/Section.svelte';
	import Slider from '../ui/Slider.svelte';
	import Toggle from '../ui/Toggle.svelte';

	const app = getAppState();
</script>

<!-- Only meaningful while the circle exists, so the whole section stays out of
     the way in Random mode. -->
{#if app.mode === 'interactive'}
	<Section title="Interactive">
		<Slider
			label="Radius"
			bind:value={app.radiusPercent}
			min={settings.radius.min}
			max={settings.radius.max}
			step={settings.radius.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<!-- Shown in milliseconds of lag, stored as the easing time constant. -->
		<Slider
			label="Responsiveness"
			bind:value={app.responsiveness}
			min={settings.responsiveness.min}
			max={settings.responsiveness.max}
			step={settings.responsiveness.step}
			formatValue={(v) => (v === 0 ? 'instant' : `${Math.round(v * 1000)}ms`)}
			parseValue={(text) => parseFloat(text) / 1000}
		/>
		<Slider
			label="Smoothing"
			info="How far in from the rim windows stop being lit outright and start being lit only if they clear their own threshold — a scattered edge rather than a clean arc."
			bind:value={app.smoothing}
			min={settings.smoothing.min}
			max={settings.smoothing.max}
			step={settings.smoothing.step}
			formatValue={formatPercent}
			parseValue={parsePercent}
		/>
		<Toggle
			label="Twinkle"
			info="Rerolls the soft edge every frame — a shimmer instead of a settled scatter."
			bind:checked={app.twinkle}
		/>
	</Section>
{/if}
