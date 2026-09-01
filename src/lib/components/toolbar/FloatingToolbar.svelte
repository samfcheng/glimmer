<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import IconButton from '../ui/IconButton.svelte';
	import {
		IconDice5,
		IconFocusCentered,
		IconLayoutSidebarRightCollapse,
		IconPlayerPause,
		IconPlayerPlay,
		IconPlayerSkipBack
	} from '@tabler/icons-svelte-runes';

	let { onResetView } = $props();

	const app = getAppState();
</script>

<!--
	Collapsing the sidebar clears the chrome off the stage entirely, toolbar
	included, so the scene gets the whole window. Every button here has a
	keyboard or pointer equivalent that still works while it is hidden —
	⌘/Ctrl + \ brings the sidebar (and the toolbar with it) back, R refits the
	view, Space plays/pauses an animation, and clicking the image scrambles.
-->
{#if app.sidebarOpen}
	<div class="toolbar" data-stage-ui>
		{#if app.mode === 'random'}
			<IconButton
				title="Scramble (or click the image)"
				onclick={() => app.scramble()}
			>
				<IconDice5 size={18} />
			</IconButton>
		{/if}
		{#if app.mode === 'animation'}
			<IconButton
				title={app.animationPlaying ? 'Pause (Space)' : 'Play (Space)'}
				onclick={() => (app.animationPlaying = !app.animationPlaying)}
			>
				{#if app.animationPlaying}
					<IconPlayerPause size={18} />
				{:else}
					<IconPlayerPlay size={18} />
				{/if}
			</IconButton>
			<IconButton title="Back to the start" onclick={() => app.restartAnimation()}>
				<IconPlayerSkipBack size={18} />
			</IconButton>
		{/if}
		{#if app.mode === 'music' && app.audio.hasTrack}
			<IconButton
				title={app.audio.playing ? 'Pause (Space)' : 'Play (Space)'}
				onclick={() => app.audio.toggle()}
			>
				{#if app.audio.playing}
					<IconPlayerPause size={18} />
				{:else}
					<IconPlayerPlay size={18} />
				{/if}
			</IconButton>
			<IconButton title="Back to the start" onclick={() => app.audio.restart()}>
				<IconPlayerSkipBack size={18} />
			</IconButton>
		{/if}
		<IconButton title="Reset view (R)" onclick={onResetView}>
			<IconFocusCentered size={18} />
		</IconButton>
		<div class="divider"></div>
		<IconButton title="Hide controls (⌘\)" onclick={() => (app.sidebarOpen = false)}>
			<IconLayoutSidebarRightCollapse size={18} />
		</IconButton>
	</div>
{/if}

<style>
	.toolbar {
		position: absolute;
		bottom: var(--space-lg);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: 4px;
		background: var(--color-panel);
		border: 1px solid var(--color-panel-border);
		border-radius: var(--radius-lg);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		z-index: 10;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: var(--color-panel-border);
	}
</style>
