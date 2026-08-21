<script>
	import { frameToScreen } from '$lib/geometry/transform.js';
	import { getAppState } from '$lib/state/app.svelte.js';

	let { center, radius, transform } = $props();

	const app = getAppState();

	let screen = $derived(frameToScreen(center, transform, app.frame));
	let screenRadius = $derived(radius * transform.scale);
</script>

<!-- Debug view of the interactive circle: where it actually is after easing,
     which is not where the cursor is. -->
<div
	class="circle"
	style="left: {screen.x}px; top: {screen.y}px; width: {screenRadius * 2}px; height: {screenRadius * 2}px;"
></div>

<style>
	.circle {
		position: absolute;
		transform: translate(-50%, -50%);
		border: 1px solid var(--color-cursor-circle);
		border-radius: 50%;
		pointer-events: none;
		z-index: 5;
	}
</style>
