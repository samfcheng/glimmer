<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import IconButton from '../ui/IconButton.svelte';
	import { IconMinus, IconUpload } from '@tabler/icons-svelte-runes';

	/** `field` is the AppState key this row owns: 'base' or 'active'. (Not
	    named `slot` — that attribute name belongs to Svelte's slot API.) */
	let { field, label, hint } = $props();

	const app = getAppState();
	let fileInputEl = $state();
	let isDragging = $state(false);

	let image = $derived(app[field]);

	function handleFiles(fileList) {
		const file = fileList?.[0];
		if (file) app.setImage(field, file);
	}
</script>

<div class="slot">
	<span class="control-label">{label}</span>
	{#if image.url}
		<div class="image-row">
			<button type="button" class="swatch" title="Replace image" onclick={() => fileInputEl.click()}>
				<img src={image.url} alt="" />
				<span class="swatch-overlay"><IconUpload size={14} /></span>
			</button>
			<div class="info">
				<span class="name">{image.name ?? 'image'}</span>
				<span class="dims">{image.naturalWidth}×{image.naturalHeight}</span>
			</div>
			<IconButton title="Remove image" plain onclick={() => app.clearImage(field)}>
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
			{hint}
		</button>
	{/if}
	<input
		bind:this={fileInputEl}
		type="file"
		accept="image/*"
		hidden
		onchange={(event) => handleFiles(event.currentTarget.files)}
	/>
</div>

<style>
	.slot {
		display: flex;
		flex-direction: column;
	}

	/* The shared utility leaves only 2px under the label, which reads as the
	   text sitting on top of the control. */
	.slot .control-label {
		margin-bottom: 6px;
	}

	.slot + :global(.slot) {
		margin-top: 4px;
	}

	/* Drag-over reads as the same emphasis a hover does. */
	.choose-file.dragging {
		opacity: 0.8;
	}

	.image-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 0;
	}

	.swatch {
		position: relative;
		flex-shrink: 0;
		width: 42px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--color-panel-border);
		border-radius: 4px;
		overflow: hidden;
		cursor: pointer;
	}

	.swatch img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.swatch-overlay {
		display: none;
		position: absolute;
		inset: 0;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		color: white;
	}

	.swatch:hover .swatch-overlay {
		display: flex;
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

	.dims {
		font-size: 10px;
		color: var(--color-text-dim);
	}
</style>
