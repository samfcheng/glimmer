<script>
	import { onMount } from 'svelte';
	import { createAppState } from '$lib/state/app.svelte.js';
	import Stage from './stage/Stage.svelte';
	import Sidebar from './sidebar/Sidebar.svelte';

	const app = createAppState();

	// `?demo=<slug>` opens straight into a bundled scene. The chrome collapses
	// with it — a deep link is for showing the piece, not editing it, and ⌘\
	// brings the sidebar back. Only on success, so a slug that doesn't resolve
	// leaves the sidebar open with the reason in the Demos section.
	onMount(async () => {
		const slug = new URLSearchParams(window.location.search).get('demo');
		if (slug && (await app.loadDemo(slug))) app.sidebarOpen = false;
	});
</script>

<div class="app">
	<Stage />
	<Sidebar />
</div>

<style>
	.app {
		display: flex;
		width: 100vw;
		height: 100vh;
	}
</style>
