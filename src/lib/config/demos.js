/**
 * Bundled demos — a ready-made scene loaded from `static/`, so the app has
 * something to show before anyone uploads anything.
 *
 * Each demo is a folder under `static/demos/<slug>/` holding four files under
 * fixed names (see `demoFiles`), which is why an entry here is only a slug and
 * a label. `settings.json` carries just the settings that differ from
 * `defaults` in `config/settings.js`; everything it leaves out stays default.
 *
 * Static assets can't be listed at runtime, so a new demo needs a line here as
 * well as its folder.
 */
export const demos = [
	{ slug: 'transamerica_pyramid', label: 'Transamerica Pyramid' },
	{ slug: 'la_graffiti_towers', label: 'LA Graffiti Towers' }
];

/** The fixed file names inside a demo folder. */
export const demoFiles = {
	base: 'default.png', // lights off
	active: 'active.png', // lights on
	svg: 'paths.svg', // one path per region
	settings: 'settings.json' // overrides on `defaults`
};

export function findDemo(slug) {
	return demos.find((demo) => demo.slug === slug) ?? null;
}

export function demoAsset(slug, file) {
	return `/demos/${slug}/${file}`;
}
