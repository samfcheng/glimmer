/**
 * The Web Audio half of music mode: an `<audio>` element for transport and
 * decoding, split into two analyser nodes for the left and right channels.
 *
 * Kept apart from `analysis.js` (which is pure arithmetic) and from
 * `state/audio.svelte.js` (which is reactive) because none of what happens
 * here is testable in jsdom — there is no `AudioContext`, no decoder, and no
 * clock.
 *
 * ```
 *   <audio> ── MediaElementSource ── upmix ──┬── volume ── destination
 *                                            └── splitter ─┬─ analyser L
 *                                                          └─ analyser R
 * ```
 */

/**
 * 2048 gives ~1024 bins — about 21 Hz apiece at 44.1 kHz, which is fine
 * resolution for a bass band, at a cost of ~46 ms of latency. Larger sounds
 * better on paper and looks worse in practice: the picture starts visibly
 * lagging the beat.
 */
export const FFT_SIZE = 2048;

/** The analyser's dB window. Below `min` reads as silence, above `max` clips. */
const MIN_DECIBELS = -85;
const MAX_DECIBELS = -12;

/** True when this browser can do any of it at all. */
export function audioSupported() {
	return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

export function createAudioEngine() {
	/** @type {HTMLAudioElement | null} */
	let element = null;
	/** @type {AudioContext | null} */
	let context = null;
	let source = null;
	let volumeNode = null;
	let analyserLeft = null;
	let analyserRight = null;
	/**
	 * A third analyser, on the summed signal, with smoothing switched off.
	 *
	 * The display analysers want smoothing — unsmoothed spectrum bars judder —
	 * but smoothing is exactly what destroys an onset: it spreads a kick's
	 * 10 ms rise over 50 ms and flattens the spike the beat detector is looking
	 * for. Rather than trade one off against the other, the beat gets raw data
	 * and the picture gets smoothed data, for the cost of one more FFT.
	 */
	let analyserBeat = null;

	// Read into the same buffers every frame; the visualisers copy nothing out
	// of them, so one set for the life of the engine is enough.
	let bytesLeft = null;
	let bytesRight = null;
	let bytesBeat = null;
	// Volume can be set before the graph exists (a slider moved, or a track
	// loaded, ahead of the first play), so it is held here and applied when the
	// nodes appear rather than being lost.
	let volume = 1;
	const frame = {
		sampleRate: 44100,
		fftSize: FFT_SIZE,
		left: { spectrum: null, waveform: null },
		right: { spectrum: null, waveform: null },
		/** Unsmoothed, summed — onset detection only. */
		beat: { spectrum: null }
	};

	function ensureElement() {
		if (element) return element;
		element = new Audio();
		element.crossOrigin = 'anonymous';
		element.preload = 'auto';
		return element;
	}

	/**
	 * Builds the graph on first play. Deliberately lazy: an `AudioContext`
	 * created before a user gesture starts suspended, and browsers log a
	 * warning about it on every page load whether or not audio is ever used.
	 */
	function ensureGraph() {
		if (context || !audioSupported()) return context;
		const Ctor = window.AudioContext || window.webkitAudioContext;
		context = new Ctor();
		source = context.createMediaElementSource(ensureElement());

		// A mono file would otherwise leave the splitter's second output silent
		// — the splitter interprets channels *discretely*, so there is nothing
		// to up-mix from. Passing through a node that asks for exactly two
		// speaker channels duplicates mono into both first, which is what makes
		// the stereo visualisers degrade to a sensible symmetric picture rather
		// than a dead right-hand side.
		const upmix = context.createGain();
		upmix.channelCount = 2;
		upmix.channelCountMode = 'explicit';
		upmix.channelInterpretation = 'speakers';

		volumeNode = context.createGain();
		volumeNode.gain.value = volume;
		// The element's own volume gates everything reaching the source node, so
		// once the gain node exists it has to be wide open or the two would
		// multiply.
		ensureElement().volume = 1;
		const splitter = context.createChannelSplitter(2);

		const makeAnalyser = () => {
			const analyser = context.createAnalyser();
			analyser.fftSize = FFT_SIZE;
			analyser.minDecibels = MIN_DECIBELS;
			analyser.maxDecibels = MAX_DECIBELS;
			// Enough to settle the spectrum bars without visibly lagging the music.
			// The beat analyser overrides this to 0 — see `analyserBeat`.
			analyser.smoothingTimeConstant = 0.6;
			return analyser;
		};
		analyserLeft = makeAnalyser();
		analyserRight = makeAnalyser();
		analyserBeat = makeAnalyser();
		analyserBeat.smoothingTimeConstant = 0;

		source.connect(upmix);
		upmix.connect(volumeNode);
		volumeNode.connect(context.destination);
		upmix.connect(splitter);
		upmix.connect(analyserBeat);
		splitter.connect(analyserLeft, 0);
		splitter.connect(analyserRight, 1);

		const bins = analyserLeft.frequencyBinCount;
		bytesLeft = { spectrum: new Uint8Array(bins), waveform: new Float32Array(FFT_SIZE) };
		bytesRight = { spectrum: new Uint8Array(bins), waveform: new Float32Array(FFT_SIZE) };
		bytesBeat = { spectrum: new Uint8Array(bins) };
		frame.left.spectrum = new Float32Array(bins);
		frame.right.spectrum = new Float32Array(bins);
		frame.beat.spectrum = new Float32Array(bins);
		frame.left.waveform = bytesLeft.waveform;
		frame.right.waveform = bytesRight.waveform;
		frame.sampleRate = context.sampleRate;
		return context;
	}

	function readSpectrum(analyser, raw, out) {
		analyser.getByteFrequencyData(raw.spectrum);
		// The byte data is already the analyser's dB window mapped to 0-255,
		// which is the perceptual scale the visualisers want; this only puts it
		// back in 0-1 so nothing downstream has to know about bytes.
		for (let i = 0; i < raw.spectrum.length; i += 1) out.spectrum[i] = raw.spectrum[i] / 255;
	}

	function readChannel(analyser, raw, out) {
		readSpectrum(analyser, raw, out);
		analyser.getFloatTimeDomainData(raw.waveform);
	}

	return {
		get element() {
			return element;
		},

		/** Points the player at a URL. Returns once its duration is known. */
		load(url) {
			const el = ensureElement();
			el.src = url;
			el.load();
			return new Promise((resolve, reject) => {
				const done = () => {
					cleanup();
					resolve(el.duration || 0);
				};
				const failed = () => {
					cleanup();
					reject(new Error("That file couldn't be decoded as audio."));
				};
				const cleanup = () => {
					el.removeEventListener('loadedmetadata', done);
					el.removeEventListener('error', failed);
				};
				el.addEventListener('loadedmetadata', done);
				el.addEventListener('error', failed);
			});
		},

		/**
		 * Decodes the whole file once, for the waveform drawn behind the
		 * scrubber. Separate from playback — `decodeAudioData` detaches the
		 * buffer it is handed, so this gets its own copy of the bytes.
		 */
		async decodePeaks(arrayBuffer, count, peaksFromChannels) {
			ensureGraph();
			if (!context) return null;
			const decoded = await context.decodeAudioData(arrayBuffer);
			const channels = [];
			for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
			return {
				peaks: peaksFromChannels(channels, count),
				duration: decoded.duration,
				channels: decoded.numberOfChannels
			};
		},

		async play() {
			ensureGraph();
			// A context created (or left) suspended stays silent until resumed,
			// and coming back from a backgrounded tab can suspend it again.
			if (context?.state === 'suspended') await context.resume();
			await ensureElement().play();
		},

		pause() {
			element?.pause();
		},

		seek(seconds) {
			if (element && Number.isFinite(seconds)) element.currentTime = Math.max(0, seconds);
		},

		setVolume(value) {
			volume = value;
			if (volumeNode) volumeNode.gain.value = value;
			// Before the graph exists the element is its own output.
			if (element) element.volume = volumeNode ? 1 : value;
		},

		setLoop(value) {
			if (element) element.loop = value;
		},

		/**
		 * The current snapshot, or null before the graph exists. Callers treat
		 * null as silence rather than as an error — nothing is loaded yet is a
		 * perfectly ordinary state for the frame loop to be in.
		 */
		read() {
			if (!analyserLeft) return null;
			readChannel(analyserLeft, bytesLeft, frame.left);
			readChannel(analyserRight, bytesRight, frame.right);
			readSpectrum(analyserBeat, bytesBeat, frame.beat);
			return frame;
		},

		dispose() {
			element?.pause();
			if (element) element.src = '';
			context?.close();
			context = null;
			source = null;
			analyserLeft = null;
			analyserRight = null;
			analyserBeat = null;
			element = null;
		}
	};
}
