import { getContext, setContext } from 'svelte';
import { defaults, withDefaults } from '../config/settings.js';
import { demoAsset, demoFiles, findDemo } from '../config/demos.js';
import { randomLevels, rollRegions } from '../light/random.js';
import {
	animationLayout as buildAnimationLayout,
	arrivalsFor,
	createStep,
	normalizeSteps,
	sequenceStarts,
	totalDuration
} from '../light/animation.js';
import { parseSvgRegions } from '../svg/regions.js';

const emptyImage = () => ({ url: null, naturalWidth: 0, naturalHeight: 0, file: null, name: null });

/** Loads a URL far enough to know its pixel dimensions. */
async function measure(url) {
	const image = new Image();
	image.src = url;
	await image.decode();
	return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
}

async function fetchAsset(url, parse) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status}).`);
	return parse(response);
}

/**
 * The single `$state` store, handed down through Svelte context (see
 * `createAppState` / `getAppState` at the bottom). Components read and mutate
 * it directly; nothing else holds scene state.
 */
export class AppState {
	/** Lights-off image — the base layer. */
	base = $state(emptyImage());
	/** Lights-on image — revealed through the region mask. */
	active = $state(emptyImage());

	/** Imported region set: `{ name, viewBox, regions, warnings }`. */
	svg = $state({ name: null, source: null, viewBox: null, regions: [], warnings: [] });

	/** Sidebar collapse — a UI preference, not scene state, but it belongs to the session. */
	sidebarOpen = $state(true);

	/** Slug of the demo currently being fetched, or null. */
	loadingDemo = $state(null);
	/** Why the last demo load failed, shown in the Demos section. */
	demoError = $state(null);

	mode = $state(defaults.mode);
	litChance = $state(defaults.litChance);
	autoScramble = $state(defaults.autoScramble);
	scrambleDelayMs = $state(defaults.scrambleDelayMs);
	radiusPercent = $state(defaults.radiusPercent);
	responsiveness = $state(defaults.responsiveness);
	smoothing = $state(defaults.smoothing);
	twinkle = $state(defaults.twinkle);
	waveDirection = $state(defaults.waveDirection);
	waveSpeed = $state(defaults.waveSpeed);
	waveLength = $state(defaults.waveLength);
	waveBand = $state(defaults.waveBand);
	waveSoftness = $state(defaults.waveSoftness);
	waveCentreX = $state(defaults.waveCentreX);
	waveCentreY = $state(defaults.waveCentreY);
	/** The animation sequence, played top to bottom. Its own copy — never the array in `defaults`. */
	animationSteps = $state(normalizeSteps(defaults.animationSteps));
	animationLoop = $state(defaults.animationLoop);
	exportScale = $state(defaults.exportScale);
	showCircle = $state(defaults.showCircle);
	showPaths = $state(defaults.showPaths);
	pathWidth = $state(defaults.pathWidth);
	fadeMs = $state(defaults.fadeMs);
	regionPaddingPx = $state(defaults.regionPaddingPx);

	/**
	 * Playhead and transport for animation mode. Session state, not settings —
	 * a demo describes a sequence, not where someone had paused it.
	 */
	animationTimeMs = $state(0);
	animationPlaying = $state(true);
	/** Which step's settings panel is open in the sidebar, or null. */
	openStepId = $state(null);

	/** Seed behind the current random-mode rolls; bumping it is a scramble. */
	seed = $state(Math.floor(Math.random() * 0xffffffff));

	/**
	 * Lit level per region, index-aligned with `svg.regions`.
	 *
	 * `$state.raw` because this is replaced wholesale — every frame of the
	 * interactive loop — and never mutated in place. Deep reactivity over a
	 * few hundred numbers at 60fps would be pure overhead.
	 */
	levels = $state.raw([]);

	get regions() {
		return this.svg.regions;
	}

	/**
	 * Whether there is anything on the stage yet. The sidebar hides every
	 * image/effect control until there is — with no scene they'd be settings
	 * for nothing — and offers the demos in their place.
	 */
	get hasImage() {
		return Boolean(this.base.url || this.active.url);
	}

	get hasScene() {
		return Boolean(this.base.url && this.active.url && this.svg.regions.length > 0);
	}

	/**
	 * The coordinate space everything is drawn in: the SVG's viewBox when
	 * there is one, otherwise the base image's own pixels — so an image alone
	 * still previews correctly before any regions are imported.
	 */
	get frame() {
		if (this.svg.viewBox) return this.svg.viewBox;
		if (this.base.naturalWidth) {
			return { x: 0, y: 0, width: this.base.naturalWidth, height: this.base.naturalHeight };
		}
		return null;
	}

	/** Circle radius in viewBox units (the slider is a share of frame width). */
	get radius() {
		return (this.frame?.width ?? 0) * this.radiusPercent;
	}

	/**
	 * Aspect-ratio complaints, checked rather than corrected: the images are
	 * stretched to fill the viewBox regardless, so a mismatch shows up as
	 * regions sitting slightly off their windows. Better to say so than to
	 * letterbox and have the regions silently misalign in a different way.
	 */
	get mismatches() {
		const notes = [];
		const ratio = (image) => (image.naturalHeight ? image.naturalWidth / image.naturalHeight : 0);
		const differ = (a, b) => a && b && Math.abs(a - b) / Math.max(a, b) > 0.01;

		if (differ(ratio(this.base), ratio(this.active))) {
			notes.push('The two images have different aspect ratios.');
		}
		if (this.svg.viewBox && differ(ratio(this.base), this.svg.viewBox.width / this.svg.viewBox.height)) {
			notes.push("The SVG's viewBox doesn't match the image aspect ratio.");
		}
		return notes;
	}

	// --- Images ---------------------------------------------------------

	async setImage(slot, file) {
		if (!file || !file.type.startsWith('image/')) return;
		const url = URL.createObjectURL(file);
		this.#adopt(slot, { url, file, name: file.name, ...(await measure(url)) });
	}

	/**
	 * The same, for an image already served at a URL — a bundled demo. No
	 * `file`, which is what keeps `clearImage` from revoking a static asset.
	 */
	async setImageUrl(slot, url, name) {
		this.#adopt(slot, { url, file: null, name, ...(await measure(url)) });
	}

	#adopt(slot, image) {
		const previous = this[slot];
		if (previous.url && previous.file) URL.revokeObjectURL(previous.url);
		this[slot] = image;
	}

	clearImage(slot) {
		const previous = this[slot];
		if (previous.url && previous.file) URL.revokeObjectURL(previous.url);
		this[slot] = emptyImage();
	}

	// --- Settings -------------------------------------------------------

	/**
	 * Applies a partial settings object, resetting everything it doesn't
	 * mention back to `defaults` — a demo describes a whole look, so it should
	 * land the same way whatever was dialled in before it.
	 */
	applySettings(overrides) {
		const resolved = withDefaults(overrides);
		for (const [key, value] of Object.entries(resolved)) this[key] = value;
		// A new sequence arrived, so the playhead into the old one means nothing.
		this.animationTimeMs = 0;
		this.openStepId = null;
	}

	// --- Demos ----------------------------------------------------------

	/**
	 * Loads a bundled demo — both images, the regions, and its settings — by
	 * slug. Resolves `true` on success; on failure it leaves the scene alone
	 * and puts the reason in `demoError` rather than throwing, since both
	 * callers (the sidebar button and the `?demo=` deep link) want to carry on.
	 */
	async loadDemo(slug) {
		const demo = findDemo(slug);
		this.demoError = null;
		if (!demo) {
			this.demoError = `There's no demo called "${slug}".`;
			return false;
		}

		this.loadingDemo = slug;
		try {
			const asset = (file) => demoAsset(slug, file);
			const [source, overrides] = await Promise.all([
				fetchAsset(asset(demoFiles.svg), (response) => response.text()),
				fetchAsset(asset(demoFiles.settings), (response) => response.json())
			]);
			await Promise.all([
				this.setImageUrl('base', asset(demoFiles.base), demo.label),
				this.setImageUrl('active', asset(demoFiles.active), demo.label)
			]);
			this.applySettings(overrides);
			this.loadSvg(source, demo.label);
			return true;
		} catch (problem) {
			this.demoError = problem.message;
			return false;
		} finally {
			this.loadingDemo = null;
		}
	}

	// --- Regions --------------------------------------------------------

	/**
	 * Replaces the region set from SVG source. Throws with a readable message
	 * on unusable input — callers surface it in the sidebar.
	 */
	loadSvg(source, name = null) {
		const { viewBox, regions, warnings } = parseSvgRegions(source);
		this.svg = { name, source, viewBox, regions, warnings };
		this.scramble();
	}

	clearSvg() {
		this.svg = { name: null, source: null, viewBox: null, regions: [], warnings: [] };
		this.levels = [];
	}

	// --- Lighting -------------------------------------------------------

	/** New seed ⇒ new rolls ⇒ a fresh set of lit windows. */
	scramble() {
		this.seed = Math.floor(Math.random() * 0xffffffff);
		if (this.mode === 'random') this.applyRandomLevels();
	}

	applyRandomLevels() {
		this.levels = randomLevels(rollRegions(this.regions.length, this.seed), this.litChance);
	}

	// --- Animation ------------------------------------------------------
	//
	// Three `$derived`s stand between the sequence and the frame loop. The loop
	// runs sixty times a second and none of these change on a frame boundary —
	// only when the scene or a step's settings do — so deriving them here is
	// what keeps playback down to one array map per frame.

	/** Every region's centroid as a fraction of the frame — the only geometry the animations see. */
	animationLayout = $derived(buildAnimationLayout(this.svg.regions, this.frame));

	/** Per step, the moment each region flips. Null for the sustained kinds, which have no order. */
	animationArrivals = $derived(
		this.animationSteps.map((step) => arrivalsFor(step, this.animationLayout))
	);

	/** Per step, the levels it begins from — the timeline folded up from an all-dark opening. */
	animationStarts = $derived(sequenceStarts(this.animationSteps, this.animationLayout));

	animationDuration = $derived(totalDuration(this.animationSteps));

	/** Appends a step and opens its panel, since a new step is always one you're about to set up. */
	addStep(kind = 'fade') {
		const step = createStep(kind);
		this.animationSteps = [...this.animationSteps, step];
		this.openStepId = step.id;
		return step;
	}

	duplicateStep(id) {
		const index = this.animationSteps.findIndex((step) => step.id === id);
		if (index === -1) return;
		// `$state.snapshot` is what detaches the copy from the original's proxy —
		// without it the two steps would share their `options` object and edit
		// each other.
		const copy = { ...$state.snapshot(this.animationSteps[index]), id: createStep().id };
		this.animationSteps = this.animationSteps.toSpliced(index + 1, 0, copy);
		this.openStepId = copy.id;
	}

	/**
	 * Switches a step to a different animation, resetting its options to the
	 * new kind's own defaults — the old ones described a different pattern, and
	 * `normalizeStep` would drop them anyway.
	 */
	setStepKind(id, kind) {
		const index = this.animationSteps.findIndex((step) => step.id === id);
		if (index === -1 || this.animationSteps[index].kind === kind) return;
		const fresh = createStep(kind);
		this.animationSteps[index] = {
			...fresh,
			id,
			// Duration, direction and easing describe the step, not the pattern,
			// so they survive a change of mind about which pattern it is.
			durationMs: this.animationSteps[index].durationMs,
			direction: this.animationSteps[index].direction,
			easing: this.animationSteps[index].easing,
			scatter: this.animationSteps[index].scatter
		};
	}

	removeStep(id) {
		this.animationSteps = this.animationSteps.filter((step) => step.id !== id);
		if (this.openStepId === id) this.openStepId = null;
	}

	/** Reorders the sequence to match `ids` — what the list's drag-to-reorder commits. */
	setStepOrder(ids) {
		const byId = new Map(this.animationSteps.map((step) => [step.id, step]));
		const reordered = ids.map((id) => byId.get(id)).filter(Boolean);
		if (reordered.length !== this.animationSteps.length) return;
		this.animationSteps = reordered;
	}

	/**
	 * Jumps the playhead to the start of a step. Editing a step you can't see
	 * is guesswork, so opening a panel scrubs to it.
	 */
	seekToStep(id) {
		const index = this.animationSteps.findIndex((step) => step.id === id);
		if (index === -1) return;
		this.animationTimeMs = this.animationSteps
			.slice(0, index)
			.reduce((sum, step) => sum + Math.max(0, step.durationMs), 0);
	}

	restartAnimation() {
		this.animationTimeMs = 0;
	}
}

const APP_CONTEXT_KEY = Symbol('app-state');

export function createAppState() {
	return setContext(APP_CONTEXT_KEY, new AppState());
}

export function getAppState() {
	return getContext(APP_CONTEXT_KEY);
}
