<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { downloadBlob, exportAnimationVideo, pickVideoType } from '$lib/render/export.js';
	import Section from '../ui/Section.svelte';
	import { IconMovie } from '@tabler/icons-svelte-runes';

	const app = getAppState();

	let progress = $state(null); // null = idle, 0-1 while recording
	let error = $state(null);

	// mp4 where the browser's own encoder supports it, webm otherwise — worth
	// saying up front rather than after a minute of recording.
	let extension = $derived(pickVideoType().includes('mp4') ? 'mp4' : 'webm');
	let seconds = $derived(app.animationDuration / 1000);
	let tooLong = $derived(seconds > settings.maxVideoSeconds);

	async function record() {
		if (progress !== null) return;
		progress = 0;
		error = null;
		// Recording replays the sequence from its own clock; leaving the stage
		// loop running alongside it just burns frames.
		const wasPlaying = app.animationPlaying;
		app.animationPlaying = false;
		try {
			const result = await exportAnimationVideo({
				base: app.base,
				active: app.active,
				frame: app.frame,
				regions: app.regions,
				steps: app.animationSteps,
				layout: app.animationLayout,
				fadeMs: app.fadeMs,
				regionPaddingPx: app.regionPaddingPx,
				scale: app.exportScale,
				onProgress: (value) => {
					progress = value;
				}
			});
			downloadBlob(result.blob, `glimmer-animation.${result.extension}`);
		} catch (problem) {
			error = problem.message;
		} finally {
			progress = null;
			app.animationPlaying = wasPlaying;
		}
	}
</script>

{#if app.mode === 'animation'}
	<Section
		title="Export"
		info="Records one full pass of the sequence, at the base image's own resolution. Recording happens in real time, so the tab is busy for as long as the animation runs."
		defaultExpanded={false}
	>
		<div class="button-row">
			<button
				type="button"
				class="button"
				disabled={!app.hasScene || progress !== null || tooLong || seconds <= 0}
				onclick={record}
			>
				<IconMovie size={12} />
				{progress === null
					? `Record ${extension.toUpperCase()}`
					: `Recording… ${Math.round(progress * 100)}%`}
			</button>
			<select class="select" bind:value={app.exportScale} aria-label="Export resolution">
				{#each settings.exportScale.options as option (option)}
					<option value={option}>{option}×</option>
				{/each}
			</select>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<!--
			Only the refusal gets prose. It has to say why the button is dead,
			and a tooltip on a disabled control is a poor place to explain that.
		-->
		{#if tooLong}
			<p class="hint">
				The sequence runs {seconds.toFixed(1)}s. Recording happens in real time and is capped at
				{settings.maxVideoSeconds}s — shorten a step or two.
			</p>
		{/if}
	</Section>
{/if}

<style>
	.hint {
		margin: 8px 0 0;
		color: var(--color-text-dim);
		font-size: 11px;
		line-height: 1.4;
	}

	.error {
		margin: 8px 0 0;
		color: var(--color-danger);
		font-size: 11px;
		line-height: 1.4;
	}

	.select {
		flex-shrink: 0;
	}
</style>
