<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { settings } from '$lib/config/settings.js';
	import Section from '../ui/Section.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Slider from '../ui/Slider.svelte';
	import { IconClipboardText, IconMinus, IconUpload, IconVectorTriangle } from '@tabler/icons-svelte-runes';

	const app = getAppState();

	let fileInputEl = $state();
	let isDragging = $state(false);
	let pasting = $state(false);
	let draft = $state('');
	let error = $state(null);

	function load(source, name) {
		try {
			app.loadSvg(source, name);
			error = null;
			pasting = false;
			draft = '';
		} catch (problem) {
			error = problem.message;
		}
	}

	async function handleFiles(fileList) {
		const file = fileList?.[0];
		if (!file) return;
		load(await file.text(), file.name);
	}

	function clear() {
		app.clearSvg();
		error = null;
	}
</script>

<Section title="Regions">
	{#if app.regions.length > 0}
		<div class="summary">
			<span class="icon"><IconVectorTriangle size={14} /></span>
			<div class="info">
				<span class="name">{app.svg.name ?? 'pasted SVG'}</span>
				<span class="count">
					{app.regions.length} region{app.regions.length === 1 ? '' : 's'} ·
					{Math.round(app.svg.viewBox.width)}×{Math.round(app.svg.viewBox.height)}
				</span>
			</div>
			<IconButton title="Remove regions" plain onclick={clear}>
				<IconMinus size={14} />
			</IconButton>
		</div>
		{#each app.svg.warnings as warning (warning)}
			<p class="note">{warning}</p>
		{/each}
		<!--
			Grows every region outwards in the mask. A little is on by default,
			since even a gapless SVG seams along shared edges; more of it closes
			real gutters between regions too.
		-->
		<Slider
			label="Padding"
			bind:value={app.regionPaddingPx}
			min={settings.regionPadding.min}
			max={settings.regionPadding.max}
			step={settings.regionPadding.step}
			formatValue={(v) => `${v}px`}
		/>
	{/if}

	<div class="button-row">
		<button
			type="button"
			class="button"
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
			{app.regions.length > 0 ? 'Replace' : 'Choose File'}
		</button>
		<button type="button" class="button" class:is-active={pasting} onclick={() => (pasting = !pasting)}>
			<IconClipboardText size={12} />
			Paste
		</button>
	</div>

	{#if pasting}
		<textarea
			class="paste-box"
			bind:value={draft}
			placeholder={'<svg viewBox="0 0 1600 900">\n  <path d="…" />\n</svg>'}
			spellcheck="false"
		></textarea>
		<button type="button" class="button" disabled={!draft.trim()} onclick={() => load(draft, null)}>
			Load {draft.trim() ? 'SVG' : ''}
		</button>
	{/if}

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<input
		bind:this={fileInputEl}
		type="file"
		accept=".svg,image/svg+xml"
		hidden
		onchange={(event) => handleFiles(event.currentTarget.files)}
	/>
</Section>

<style>
	.button.dragging {
		opacity: 0.8;
	}

	.summary {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 0 6px;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 42px;
		height: 32px;
		border: 1px solid var(--color-panel-border);
		border-radius: 4px;
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

	.count {
		font-size: 10px;
		color: var(--color-text-dim);
	}

	.paste-box {
		width: 100%;
		height: 96px;
		margin: 6px 0;
		padding: 6px 8px;
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-input-bg);
		color: var(--color-text);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		line-height: 1.5;
		resize: vertical;
	}

	.paste-box:focus {
		outline: 1px solid var(--color-accent);
	}

	.note {
		margin: 6px 0 0;
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
</style>
