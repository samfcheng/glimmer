import { audioSupported, createAudioEngine, FFT_SIZE } from '../audio/engine.js';
import { peaksFromChannels } from '../audio/analysis.js';

/** How many buckets the scrubber's waveform preview is drawn from. */
const PEAK_COUNT = 180;

/**
 * The loaded track and its transport, as reactive state.
 *
 * Split from `audio/engine.js` the way `AppState` is split from `light/*`: the
 * engine owns the `AudioContext` and knows nothing about runes, this owns what
 * the sidebar renders and knows nothing about Web Audio.
 *
 * Playback position is *not* mirrored from the element's `timeupdate` event,
 * which only fires about four times a second — far too coarse for a moving
 * playhead. `sync()` pulls it once per animation frame from the loop in
 * `Stage.svelte` instead, which is exactly when anyone can see it.
 */
export class AudioTrack {
	name = $state(null);
	/** Currently-playing URL. Object URLs (from an upload) get revoked; a sample's path doesn't. */
	url = $state(null);
	#isObjectUrl = false;

	playing = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	loading = $state(false);
	error = $state(null);

	/** Session state, not settings — a demo describes a look, not a volume. */
	volume = $state(0.9);
	loop = $state(true);

	/** Peak envelope for the scrubber, or null while it is still decoding. */
	peaks = $state.raw(null);
	/** Channel count of the decoded file — what the Stereo toggle's hint reports. */
	channels = $state(0);

	/** Instantaneous per-channel RMS, written by the frame loop for the meter. */
	meterLeft = $state(0);
	meterRight = $state(0);

	#engine = createAudioEngine();

	get supported() {
		return audioSupported();
	}

	get hasTrack() {
		return Boolean(this.url);
	}

	get progress() {
		return this.duration > 0 ? this.currentTime / this.duration : 0;
	}

	async setFile(file) {
		if (!file) return;
		// Some browsers hand an mp3 dropped from certain apps an empty `type`,
		// so the extension gets a say too rather than refusing a real file.
		if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name)) {
			this.error = "That doesn't look like an audio file.";
			return;
		}
		await this.#adopt(URL.createObjectURL(file), file.name, true, () => file.arrayBuffer());
	}

	/** The same, for audio already served at a URL — the bundled sample. */
	async setUrl(url, name) {
		await this.#adopt(url, name, false, async () => {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status}).`);
			return response.arrayBuffer();
		});
	}

	async #adopt(url, name, isObjectUrl, readBytes) {
		this.#release();
		this.url = url;
		this.#isObjectUrl = isObjectUrl;
		this.name = name;
		this.loading = true;
		this.error = null;
		this.peaks = null;
		this.channels = 0;
		this.currentTime = 0;
		this.playing = false;
		try {
			this.duration = await this.#engine.load(url);
			this.#engine.setLoop(this.loop);
			this.#engine.setVolume(this.volume);
		} catch (problem) {
			this.error = problem.message;
			this.loading = false;
			return;
		}
		this.loading = false;

		// Decoding the whole file for the scrubber's waveform is deliberately
		// *not* awaited: the element can already play, and on a long track this
		// would otherwise hold up the first note for as long as the decode takes.
		// The `url` check is what stops a slow decode landing on a track that has
		// since been replaced.
		//
		// It is a nicety besides — a decode failure (an exotic codec the element
		// can still stream) costs the picture behind the scrubber and nothing
		// else, so it must not take the track down with it.
		readBytes()
			.then((bytes) => this.#engine.decodePeaks(bytes, PEAK_COUNT, peaksFromChannels))
			.then((decoded) => {
				if (!decoded || this.url !== url) return;
				this.peaks = decoded.peaks;
				this.channels = decoded.channels;
				if (decoded.duration) this.duration = decoded.duration;
			})
			.catch(() => {
				this.peaks = null;
			});
	}

	#release() {
		if (this.url && this.#isObjectUrl) URL.revokeObjectURL(this.url);
		this.#isObjectUrl = false;
	}

	clear() {
		this.#engine.pause();
		this.#release();
		this.url = null;
		this.name = null;
		this.playing = false;
		this.currentTime = 0;
		this.duration = 0;
		this.peaks = null;
		this.channels = 0;
		this.error = null;
		this.meterLeft = 0;
		this.meterRight = 0;
	}

	async play() {
		if (!this.url) return;
		try {
			await this.#engine.play();
			this.playing = true;
			this.error = null;
		} catch (problem) {
			this.error = problem.message;
			this.playing = false;
		}
	}

	pause() {
		this.#engine.pause();
		this.playing = false;
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	restart() {
		this.#engine.seek(0);
		this.currentTime = 0;
	}

	/** Seeks to a fraction of the track — what the scrubber commits. */
	seekFraction(fraction) {
		if (!(this.duration > 0)) return;
		const seconds = Math.min(Math.max(fraction, 0), 1) * this.duration;
		this.#engine.seek(seconds);
		this.currentTime = seconds;
	}

	setVolume(value) {
		this.volume = value;
		this.#engine.setVolume(value);
	}

	setLoop(value) {
		this.loop = value;
		this.#engine.setLoop(value);
	}

	/** Mirrors the element's clock into reactive state; called once per frame. */
	sync() {
		const element = this.#engine.element;
		if (!element) return;
		this.currentTime = element.currentTime;
		if (element.duration && Number.isFinite(element.duration)) this.duration = element.duration;
		// The element can stop on its own (the end of a non-looping track), and
		// the transport button has to notice.
		const playing = !element.paused && !element.ended;
		if (playing !== this.playing) this.playing = playing;
	}

	read() {
		return this.#engine.read();
	}
}

export { FFT_SIZE };
