<script>
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { applyStyles } from '$lib/config/styles.js';
	import meta from '$lib/config/meta.json';

	let { children } = $props();

	applyStyles();

	// og:image must be an absolute URL for link-preview scrapers, so the
	// relative path from meta.json is resolved against the configured site
	// origin (update `siteUrl` there when deploying).
	const ogImageUrl = new URL(meta.ogImage, meta.siteUrl).href;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={meta.siteUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

{@render children()}
