<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import { audioSample } from '$lib/config/demos.js';
	import { MUSIC_DRIVERS } from '$lib/audio/analysis.js';
	import { MUSIC_DIRECTIONS, MUSIC_VISUALS } from '$lib/light/music.js';
	import { formatPercent, parsePercent } from '$lib/utils/percent.js';
	import Section from '../ui/Section.svelte';
	import Select from '../ui/Select.svelte';
	import Slider from '../ui/Slider.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import {
		IconMinus,
		IconMusic,
		IconPlayerPause,
		IconPlayerPlay,
		IconPlayerSkipBack,
		IconRepeat,
		IconRepeatOff,
		IconUpload
	} from '@tabler/icons-svelte-runes';

	const app = getAppState();
	const audio = app.audio;

	// Unique per instance, so the clip path's document-wide id could never
	// collide with another copy of this panel.
	const clipId = `music-played-${Math.random().toString(36).slice(2, 9)}`;

	let fileInputEl = $state();
	let isDragging = $state(false);

	const clock = (seconds) => {
		if (!Number.isFinite(seconds)) return '0:00';
		const whole = Math.max(0, Math.floor(seconds));
		return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
	};

	function handleFiles(fileList) {
		const file = fileList?.[0];
		if (file) audio.setFile(file).then(() => !audio.error && audio.play());
	}

	function loadSample() {
		audio.setUrl(audioSample.url, audioSample.label).then(() => !audio.error && audio.play());
	}

	// --- Scrubbing ------------------------------------------------------
	// Same shape as the animation timeline's scrubber: pointer capture, so a
	// drag that leaves the little track keeps seeking rather than stopping dead
	// at the edge.

	let trackEl = $state();
	let scrubPointerId = null;

	function seekFromClientX(clientX) {
		if (!trackEl || !(audio.duration > 0)) return;
		const rect = trackEl.getBoundingClientRect();
		audio.seekFraction((clientX - rect.left) / rect.width);
	}

	function handleTrackPointerDown(event) {
		if (event.button !== 0 || !audio.hasTrack) return;
		scrubPointerId = event.pointerId;
		trackEl.setPointerCapture(event.pointerId);
		seekFromClientX(event.clientX);
	}

	function handleTrackPointerMove(event) {
		if (scrubPointerId !== event.pointerId) return;
		seekFromClientX(event.clientX);
	}

	function handleTrackPointerUp(event) {
		if (scrubPointerId !== event.pointerId) return;
		if (trackEl.hasPointerCapture(event.pointerId)) trackEl.releasePointerCapture(event.pointerId);
		scrubPointerId = null;
	}

	// The waveform preview is drawn as one polygon rather than a bar per bucket
	// — 180 `<rect>`s re-laid-out on every frame of the playhead is a lot of DOM
	// for a 14px-tall picture. Mirrored around the middle so it reads as a
	// waveform and not a bar chart.
	let waveformPath = $derived.by(() => {
		const peaks = audio.peaks;
		if (!peaks?.length) return null;
		const step = 100 / (peaks.length - 1 || 1);
		const top = [];
		const bottom = [];
		for (let i = 0; i < peaks.length; i += 1) {
			const x = (i * step).toFixed(2);
			// A floor keeps a silent passage as a visible centre line rather than
			// a gap in the middle of the strip.
			const half = Math.max(peaks[i], 0.02) * 50;
			top.push(`${x},${(50 - half).toFixed(2)}`);
			bottom.push(`${x},${(50 + half).toFixed(2)}`);
		}
		return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
	});

	let visual = $derived(app.musicVisual);
	// Pulse and Level are the two driven by a single number off the audio, so
	// they are the two that get to choose what that number measures and how
	// quickly it falls away. Spectrum and Scope draw the buffers directly.
	let drivenByAudioLevel = $derived(visual === 'pulse' || visual === 'level');
	// A file the decoder reported as one channel has nothing to separate, so
	// the toggle says so instead of pretending it does something.
	let monoFile = $derived(audio.channels === 1);
</script>

{#if app.mode === 'music'}
	<Section
		title="Music"
		info="Drop an audio file anywhere on the stage, or pick one here. Space plays and pauses."
	>
		{#if !audio.supported}
			<p class="hint">This browser has no Web Audio support, so music mode can't analyse anything.</p>
		{/if}

		{#if audio.hasTrack}
			<div class="track-row">
				<span class="badge"><IconMusic size={14} /></span>
				<div class="info">
					<span class="name">{audio.name ?? 'audio'}</span>
					<span class="meta">
						{clock(audio.duration)}{#if audio.channels}
							· {audio.channels === 1 ? 'mono' : 'stereo'}{/if}
					</span>
				</div>
				<IconButton title="Replace" plain onclick={() => fileInputEl.click()}>
					<IconUpload size={14} />
				</IconButton>
				<IconButton title="Remove" plain onclick={() => audio.clear()}>
					<IconMinus size={14} />
				</IconButton>
			</div>
		{:else}
			<button
				type="button"
				class="button choose-file"
				class:dragging={isDragging}
				ondragover={(event) => {
					event.preventDefault();
					isDragging = true;
				}}
				ondragleave={() => (isDragging = false)}
				ondrop={(event) => {
					event.preventDefault();
					isDragging = false;
					handleFiles(event.dataTransfer.files);
				}}
				onclick={() => fileInputEl.click()}
			>
				<IconUpload size={12} />
				Choose an audio file
			</button>
			<button type="button" class="button" onclick={loadSample}>
				<IconMusic size={12} />
				{audioSample.label}
			</button>
		{/if}

		<input
			bind:this={fileInputEl}
			type="file"
			accept="audio/*"
			hidden
			onchange={(event) => handleFiles(event.currentTarget.files)}
		/>

		{#if audio.error}
			<p class="hint error">{audio.error}</p>
		{/if}

		{#if audio.hasTrack}
			<div class="transport">
				<IconButton
					plain
					title={audio.playing ? 'Pause (Space)' : 'Play (Space)'}
					onclick={() => audio.toggle()}
				>
					{#if audio.playing}
						<IconPlayerPause size={14} />
					{:else}
						<IconPlayerPlay size={14} />
					{/if}
				</IconButton>
				<IconButton plain title="Back to the start" onclick={() => audio.restart()}>
					<IconPlayerSkipBack size={14} />
				</IconButton>
				<IconButton
					plain
					title={audio.loop ? 'Looping — click to play once' : 'Playing once — click to loop'}
					onclick={() => audio.setLoop(!audio.loop)}
				>
					{#if audio.loop}
						<IconRepeat size={14} />
					{:else}
						<IconRepeatOff size={14} />
					{/if}
				</IconButton>
				<span class="clock">{clock(audio.currentTime)} / {clock(audio.duration)}</span>
			</div>

			<!--
				The scrubber doubles as the waveform, the way the animation
				timeline doubles as the step list: the shape of the clip is what
				tells you where the drop is before you have heard it.
			-->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="track"
				bind:this={trackEl}
				onpointerdown={handleTrackPointerDown}
				onpointermove={handleTrackPointerMove}
				onpointerup={handleTrackPointerUp}
				onpointercancel={handleTrackPointerUp}
			>
				{#if waveformPath}
					<svg class="waveform" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
						<path d={waveformPath} />
						<!--
							The played part is the same path clipped to the playhead,
							rather than a second overlay — one shape, so the two halves
							can never disagree about where the waveform is.
						-->
						<clipPath id={clipId}><rect x="0" y="0" width={audio.progress * 100} height="100" /></clipPath>
						<path class="played" d={waveformPath} clip-path="url(#{clipId})" />
					</svg>
				{:else}
					<div class="fill" style:width="{audio.progress * 100}%"></div>
				{/if}
				<div class="playhead" style:left="{audio.progress * 100}%"></div>
			</div>

			<!--
				A two-channel meter, so you can see the analyser is hearing
				something (and which side it is hearing it on) before deciding
				whether a dead-looking scene is the audio or the settings.
			-->
			<div class="meter" title="Left / right input level">
				<div class="meter-bar"><div class="meter-fill" style:width="{Math.min(1, audio.meterLeft * 2.5) * 100}%"></div></div>
				<div class="meter-bar"><div class="meter-fill" style:width="{Math.min(1, audio.meterRight * 2.5) * 100}%"></div></div>
			</div>

			<Slider
				label="Volume"
				bind:value={audio.volume}
				min={settings.musicVolume.min}
				max={settings.musicVolume.max}
				step={settings.musicVolume.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
				onValueChange={(value) => audio.setVolume(value)}
			/>
		{/if}
	</Section>

	<Section
		title="Visualizer"
		info="How the audio is turned into light. The level is stretched to whatever range the track has been using lately, so every visualiser uses the full sweep from dark to lit without anything to dial."
	>
		<Select label="Visual" bind:value={app.musicVisual} options={MUSIC_VISUALS} />

		{#if visual === 'pulse'}
			<p class="hint">
				Random mode with the music holding the Lit Chance slider — windows scatter on as the track
				swells.
			</p>
		{:else if visual === 'level'}
			<p class="hint">A VU meter drawn in windows: the scene fills along an axis as the track gets louder.</p>
		{:else if visual === 'spectrum'}
			<p class="hint">
				A bar graph across the image: horizontal position picks a frequency, height is how loud it is.
			</p>
		{:else}
			<p class="hint">An oscilloscope traced through the windows — the waveform itself, drawn in light.</p>
		{/if}

		{#if drivenByAudioLevel}
			<Select
				label="Driven by"
				info="Beat fires on each new hit in the low end and is silent between them. The four bands instead follow how loud that slice of the mix is right now — which on a track with a sustained 808 barely twitches on the kick, however loud it is."
				bind:value={app.musicDriver}
				options={MUSIC_DRIVERS}
			/>
			<Slider
				label="Decay"
				info="How long the light takes to fall away after a hit. Short is a strobe on the beat; long is a slow breath. The rise is always immediate."
				bind:value={app.musicDecayMs}
				min={settings.musicDecay.min}
				max={settings.musicDecay.max}
				step={settings.musicDecay.step}
				formatValue={(v) => `${v}ms`}
			/>
		{/if}

		{#if visual === 'pulse'}
			<Toggle
				label="Reshuffle"
				info="Draws a new scatter of windows on every hit. Off, each window is judged against one roll fixed at import, so the same windows are lit in every bar of the song."
				bind:checked={app.musicChurn}
			/>
			<Slider
				label="Base"
				info="The share of windows that stays lit between hits — a building that goes completely dark reads as broken rather than as quiet."
				bind:value={app.musicBase}
				min={settings.musicBase.min}
				max={settings.musicBase.max}
				step={settings.musicBase.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
		{/if}

		{#if visual === 'level'}
			<Select label="Fills" bind:value={app.musicDirection} options={MUSIC_DIRECTIONS} />
		{/if}

		{#if visual === 'spectrum'}
			<Toggle
				label="Mirror"
				info="Folds the frequency axis so the bass sits in the middle and the treble runs out to both edges — which is what makes room for stereo, one channel per half."
				bind:checked={app.musicMirror}
			/>
		{/if}

		{#if visual === 'scope'}
			<Slider
				label="Amplitude"
				bind:value={app.musicAmplitude}
				min={settings.musicAmplitude.min}
				max={settings.musicAmplitude.max}
				step={settings.musicAmplitude.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
			<Slider
				label="Thickness"
				info="How far either side of the traced line a window still counts as being on it. Turn it up on a scene with few windows."
				bind:value={app.musicThickness}
				min={settings.musicThickness.min}
				max={settings.musicThickness.max}
				step={settings.musicThickness.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
		{/if}

		<!-- Pulse is pure scatter, so it has no edge for Softness to dither. -->
		{#if visual !== 'pulse'}
			<Slider
				label="Softness"
				info="How much of an edge — a meter's front, a bar's top, the scope's line — is dithered against each window's own roll rather than solid."
				bind:value={app.musicSoftness}
				min={settings.musicSoftness.min}
				max={settings.musicSoftness.max}
				step={settings.musicSoftness.step}
				formatValue={formatPercent}
				parseValue={parsePercent}
			/>
		{/if}

		<Toggle
			label="Stereo"
			info={monoFile
				? 'This file is mono, so both sides get the same signal.'
				: 'Takes the left channel on the left of the image and the right on the right — a wide mix visibly spreads out, a centred one stays symmetric.'}
			bind:checked={app.musicStereo}
		/>
	</Section>
{/if}

<style>
	.hint {
		margin: 4px 0;
		color: var(--color-text-muted);
		font-size: 11px;
		line-height: 1.45;
	}

	.hint.error {
		color: var(--color-danger);
	}

	.choose-file.dragging {
		opacity: 0.8;
	}

	.track-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 0 6px;
	}

	.badge {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		background: var(--color-input-bg);
		color: var(--color-text-muted);
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-size: 11px;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		font-size: 10px;
		color: var(--color-text-dim);
		font-variant-numeric: tabular-nums;
	}

	.transport {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) 0;
	}

	/* Matches the animation transport: 16px plain buttons sit too tight
	   together without a little air. */
	.transport :global(.icon-button) {
		width: 20px;
	}

	.clock {
		margin-left: auto;
		color: var(--color-text-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.track {
		position: relative;
		height: 30px;
		margin: 2px 0 6px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-track);
		cursor: pointer;
		touch-action: none;
	}

	.waveform {
		display: block;
		width: 100%;
		height: 100%;
	}

	.waveform path {
		fill: var(--color-track-fill);
	}

	.waveform path.played {
		fill: var(--color-accent);
	}

	/* Shown until the decode lands (and if it never does) so the scrubber is
	   usable either way. */
	.fill {
		height: 100%;
		background: var(--color-track-fill);
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--color-text);
		pointer-events: none;
	}

	.meter {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 2px 0 6px;
	}

	.meter-bar {
		height: 3px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--color-track);
	}

	.meter-fill {
		height: 100%;
		background: var(--color-accent);
		/* The meter is written 60 times a second; a transition here is what
		   keeps it from reading as a strobe on percussive material. */
		transition: width 60ms linear;
	}
</style>
