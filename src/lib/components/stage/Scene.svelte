<script>
	import { getAppState } from '$lib/state/app.svelte.js';
	import { frameTransformAttr } from '$lib/geometry/transform.js';

	let { transform, width, height } = $props();

	const app = getAppState();

	// Unique per instance so two scenes on a page could never collide over the
	// mask's document-wide id.
	const maskId = `lit-mask-${Math.random().toString(36).slice(2, 9)}`;

	let frame = $derived(app.frame);
	let contentTransform = $derived(frame ? frameTransformAttr(transform, frame) : '');
</script>

{#if frame}
	<svg class="scene" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
		<defs>
			<!--
				The lit layer is one image composited through one mask, rather than
				a path per region each filled with a copy of the image: the cost
				stays flat as the region count climbs, while per-region `opacity`
				still gives every window its own state (and its own fade). Pure
				white is deliberate — mask luminance then depends only on the alpha
				the opacity sets, dodging the colour-space question a tinted fill
				would raise.
			-->
			<!--
				Each region is grown by a white stroke (`stroke-width` is doubled
				because only its outer half lands outside the path) to close the
				anti-aliasing seam where two regions share an edge — see
				`settings.regionPadding`. `opacity` rather than `fill-opacity`
				carries the level: it composites fill and stroke as one group, so a
				half-lit region doesn't show a brighter rim where the stroke's
				inner half doubles up on the fill.
			-->
			<!--
				Both the mask region and its content are declared in the SVG's own
				viewport coordinates — the view transform is applied *inside* the
				mask (and inside the masked group), never on the element that
				carries `mask=`. Whether an element's own transform also transforms
				its mask is exactly the sort of detail browsers have historically
				disagreed on; keeping both sides in root space makes the question
				moot, so pan and zoom can't slide the lights off their windows.
			-->
			<mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" {width} {height}>
				<g transform={contentTransform} style="--fade: {app.fadeMs}ms">
					{#each app.regions as region, i (region.id)}
						<path
							class="region"
							d={region.d}
							transform={region.transform}
							fill="#fff"
							stroke={app.regionPaddingPx > 0 ? '#fff' : 'none'}
							stroke-width={app.regionPaddingPx * 2}
							stroke-linejoin="round"
							vector-effect="non-scaling-stroke"
							opacity={app.levels[i] ?? 0}
						/>
					{/each}
				</g>
			</mask>
		</defs>

		<g transform={contentTransform}>
			<!--
				Both images are stretched to the frame rather than letterboxed
				inside it: the regions are authored against the viewBox, so
				matching the viewBox exactly is what keeps a window's path over
				its window. A mismatched aspect ratio is reported in the sidebar
				instead of being silently absorbed here.
			-->
			{#if app.base.url}
				<image
					href={app.base.url}
					x={frame.x}
					y={frame.y}
					width={frame.width}
					height={frame.height}
					preserveAspectRatio="none"
				/>
			{/if}
		</g>
		{#if app.active.url}
			<g mask="url(#{maskId})">
				<g transform={contentTransform}>
					<image
						href={app.active.url}
						x={frame.x}
						y={frame.y}
						width={frame.width}
						height={frame.height}
						preserveAspectRatio="none"
					/>
				</g>
			</g>
		{/if}
		<!--
			Debug outlines. `vector-effect="non-scaling-stroke"` is the whole
			trick: the stroke stays 1px on screen at any zoom, so it reads as a
			constant hairline while getting thinner relative to the image as you
			zoom in — which is what makes it usable for checking alignment.
		-->
		{#if app.showPaths}
			<g transform={contentTransform} style="--fade: {app.fadeMs}ms">
				{#each app.regions as region, i (region.id)}
					<path
						class="outline"
						class:lit={app.levels[i]}
						d={region.d}
						transform={region.transform}
						stroke-width={app.pathWidth}
						vector-effect="non-scaling-stroke"
					/>
				{/each}
			</g>
		{/if}

	</svg>
{/if}

<style>
	.scene {
		position: absolute;
		inset: 0;
		display: block;
	}

	/* Fading the mask paths is what turns a window "on" gradually. `--fade` is
	   set on their group so one declaration covers every region. */
	.region {
		transition: opacity var(--fade) linear;
	}

	.outline {
		fill: none;
		stroke: var(--color-path-unlit);
		transition: stroke var(--fade) linear;
	}

	.outline.lit {
		stroke: var(--color-path-lit);
	}

	@media (prefers-reduced-motion: reduce) {
		.region,
		.outline {
			transition: none;
		}
	}
</style>
