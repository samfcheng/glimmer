<script>
	/**
	 * A worked example of the editor framework — and the thing that keeps it
	 * honest, since every part of the public API is exercised here.
	 *
	 * Nothing in this file imports from the rest of Glimmer: it reaches only
	 * into `components/editor`, the same way a fresh project would.
	 */
	import {
		Button,
		Editor,
		IconButton,
		Section,
		SegmentedToggle,
		Select,
		Slider,
		Toggle,
		ThemeState,
		formatPercent,
		parsePercent
	} from '$lib/components/editor/index.js';
	import { IconDice5, IconRotate } from '@tabler/icons-svelte-runes';

	// The scene's own coordinate system. Everything below is authored in these
	// units; the editor is what maps them to screen pixels.
	const SIZE = 1000;
	const content = { x: 0, y: 0, width: SIZE, height: SIZE };

	const theme = new ThemeState({ storageKey: 'editor-demo-theme' });

	const SHAPES = [
		{ value: 'circle', label: 'Circle' },
		{ value: 'square', label: 'Square' },
		{ value: 'diamond', label: 'Diamond' },
		{ value: 'cross', label: 'Cross' }
	];

	let columns = $state(12);
	let rows = $state(12);
	let shape = $state('circle');
	let fill = $state(0.62);
	let rotation = $state(0);
	let hue = $state(210);
	let hueSpread = $state(70);
	let falloff = $state(0.5);
	let spinning = $state(false);
	let backdrop = $state(null);

	/** Where the size falloff is centred. Click the canvas to move it. */
	let focus = $state({ x: SIZE / 2, y: SIZE / 2 });

	/** Extra rotation from the spin animation, in degrees. */
	let spin = $state(0);

	let cells = $derived.by(() => {
		const cellW = SIZE / columns;
		const cellH = SIZE / rows;
		const base = Math.min(cellW, cellH) * fill;
		const maxDistance = Math.hypot(SIZE, SIZE) / 2;
		const out = [];

		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const cx = (column + 0.5) * cellW;
				const cy = (row + 0.5) * cellH;
				const distance = Math.hypot(cx - focus.x, cy - focus.y) / maxDistance;
				const size = base * (1 - falloff * Math.min(1, distance));
				// Hue ramps along the diagonal, so the spread reads as a gradient
				// across the whole grid rather than per-row banding.
				const t = (column / Math.max(1, columns - 1) + row / Math.max(1, rows - 1)) / 2;
				out.push({
					id: `${row}:${column}`,
					cx,
					cy,
					size: Math.max(0, size),
					color: `hsl(${(hue + t * hueSpread) % 360} 70% 58%)`
				});
			}
		}
		return out;
	});

	/** The shape's outline as a path, drawn in a unit box centred on the origin. */
	function shapePath(size) {
		const r = size / 2;
		switch (shape) {
			case 'square':
				return `M${-r} ${-r}H${r}V${r}H${-r}Z`;
			case 'diamond':
				return `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`;
			case 'cross': {
				const arm = r / 3;
				return `M${-arm} ${-r}H${arm}V${-arm}H${r}V${arm}H${arm}V${r}H${-arm}V${arm}H${-r}V${-arm}H${-arm}Z`;
			}
			default:
				return `M${-r} 0a${r} ${r} 0 1 0 ${size} 0a${r} ${r} 0 1 0 ${-size} 0Z`;
		}
	}

	function randomize() {
		columns = 4 + Math.floor(Math.random() * 24);
		rows = 4 + Math.floor(Math.random() * 24);
		shape = SHAPES[Math.floor(Math.random() * SHAPES.length)].value;
		fill = 0.3 + Math.random() * 0.6;
		rotation = Math.floor(Math.random() * 90);
		hue = Math.floor(Math.random() * 360);
		hueSpread = Math.floor(Math.random() * 180);
		falloff = Math.random();
	}

	// The spin loop only exists while it's switched on — an editor that idles
	// at zero CPU when nothing is moving is the whole point of tearing the
	// frame loop down in the effect's cleanup.
	$effect(() => {
		if (!spinning) return;
		let frame = 0;
		let last = performance.now();
		const tick = (now) => {
			frame = requestAnimationFrame(tick);
			spin = (spin + (now - last) * 0.03) % 360;
			last = now;
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	function handleDropFiles(files) {
		const image = files.find((file) => file.type.startsWith('image/'));
		if (!image) return;
		if (backdrop) URL.revokeObjectURL(backdrop);
		backdrop = URL.createObjectURL(image);
	}
</script>

<svelte:head>
	<title>Editor demo — Glimmer</title>
</svelte:head>

<div class="page">
	<Editor
		{content}
		showZoom
		emptyMessage={cells.length === 0 ? 'Nothing to draw — raise the column or row count.' : null}
		dropHint="Drop an image to use as a backdrop"
		onDropFiles={handleDropFiles}
		onCanvasClick={(point) => (focus = point)}
	>
		{#snippet canvas({ editor, width: viewW, height: viewH })}
			<!--
				The scene is authored in plain 0–1000 coordinates; `editor.svgTransform`
				is what puts it where the current pan and zoom say it goes. Everything
				inside the <g> can stay ignorant of the view.
			-->
			<svg class="scene" width={viewW} height={viewH} viewBox="0 0 {viewW} {viewH}" aria-hidden="true">
				<g transform={editor.svgTransform}>
					{#if backdrop}
						<image href={backdrop} x="0" y="0" width={SIZE} height={SIZE} opacity="0.35" />
					{/if}
					<rect x="0" y="0" width={SIZE} height={SIZE} class="plate" />
					{#each cells as cell (cell.id)}
						<path
							d={shapePath(cell.size)}
							fill={cell.color}
							transform="translate({cell.cx} {cell.cy}) rotate({rotation + spin})"
						/>
					{/each}
				</g>
			</svg>
		{/snippet}

		{#snippet toolbar()}
			<IconButton title="Randomize" onclick={randomize}>
				<IconDice5 size={18} />
			</IconButton>
			<IconButton title="Spin" active={spinning} onclick={() => (spinning = !spinning)}>
				<IconRotate size={18} />
			</IconButton>
		{/snippet}

		{#snippet sidebar()}
			<Section title="Grid" info="The pattern is laid out across a fixed 1000×1000 scene.">
				<Slider label="Columns" bind:value={columns} min={0} max={40} />
				<Slider label="Rows" bind:value={rows} min={0} max={40} />
			</Section>

			<Section title="Shape">
				<Select label="Form" bind:value={shape} options={SHAPES} />
				<Slider
					label="Fill"
					info="How much of each cell the shape takes up. Drag the number sideways to scrub it."
					bind:value={fill}
					min={0}
					max={1}
					step={0.01}
					formatValue={formatPercent}
					parseValue={parsePercent}
				/>
				<Slider
					label="Rotation"
					bind:value={rotation}
					min={0}
					max={360}
					formatValue={(v) => `${v}°`}
				/>
			</Section>

			<Section title="Colour">
				<Slider label="Hue" bind:value={hue} min={0} max={360} formatValue={(v) => `${v}°`} />
				<Slider
					label="Spread"
					info="How far the hue travels across the grid's diagonal."
					bind:value={hueSpread}
					min={0}
					max={360}
					formatValue={(v) => `${v}°`}
				/>
			</Section>

			<Section title="Focus" info="Click anywhere on the canvas to move the focal point.">
				<Slider
					label="Falloff"
					bind:value={falloff}
					min={0}
					max={1}
					step={0.01}
					formatValue={formatPercent}
					parseValue={parsePercent}
				/>
				<p class="editor-hint">
					Focal point: {Math.round(focus.x)}, {Math.round(focus.y)}
				</p>
				<div class="editor-button-row">
					<Button onclick={() => (focus = { x: SIZE / 2, y: SIZE / 2 })}>Centre</Button>
					<Button onclick={randomize}>Randomize</Button>
				</div>
			</Section>

			<Section title="Motion" defaultExpanded={false}>
				<Toggle label="Spin" info="Rotates every shape continuously." bind:checked={spinning} />
			</Section>

			<Section title="Appearance" defaultExpanded={false}>
				<SegmentedToggle
					label="Theme"
					value={theme.value}
					onValueChange={(value) => theme.set(value)}
					options={[
						{ value: 'light', label: 'Light' },
						{ value: 'dark', label: 'Dark' }
					]}
				/>
				{#if backdrop}
					<Button danger onclick={() => (backdrop = null)}>Clear backdrop</Button>
				{/if}
				<p class="editor-hint">
					Scroll to pan, ⌘/Ctrl-scroll or pinch to zoom, R to refit, ⌘\ to hide this panel.
				</p>
			</Section>
		{/snippet}
	</Editor>
</div>

<style>
	.page {
		width: 100vw;
		height: 100dvh;
	}

	.scene {
		position: absolute;
		inset: 0;
		display: block;
	}

	.plate {
		fill: var(--editor-color-panel);
		opacity: 0.5;
	}
</style>
