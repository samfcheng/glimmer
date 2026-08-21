<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { theme } from '$lib/state/theme.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import Section from '../ui/Section.svelte';
	import Slider from '../ui/Slider.svelte';
	import SegmentedToggle from '../ui/SegmentedToggle.svelte';

	const app = getAppState();
</script>

<Section title="Appearance" defaultExpanded={false}>
	<!-- Cross-fade between a region's dark and lit state. 0 snaps. -->
	<Slider
		label="Fade"
		bind:value={app.fadeMs}
		min={settings.fade.min}
		max={settings.fade.max}
		step={settings.fade.step}
		formatValue={(v) => `${v}ms`}
	/>
	<SegmentedToggle
		label="Theme"
		value={theme.value}
		onValueChange={(value) => theme.set(value)}
		options={[
			{ value: 'light', label: 'Light' },
			{ value: 'dark', label: 'Dark' }
		]}
	/>
</Section>
