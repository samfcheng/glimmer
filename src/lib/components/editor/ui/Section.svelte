<script>
	import { IconChevronDown } from '@tabler/icons-svelte-runes';
	import InfoTip from './InfoTip.svelte';

	let {
		title,
		/** Optional one-line explanation, shown behind an "i" beside the title. */
		info = null,
		/** Snippet for controls in the header itself, e.g. an "add" button. */
		action = null,
		collapsible = true,
		showChevron = collapsible,
		defaultExpanded = true,
		/** bind: it to drive the section from outside. */
		expanded = $bindable(defaultExpanded),
		children
	} = $props();

	// Clicking anywhere in the header toggles the section — except clicking an
	// action button, which only ever force-opens it: a plain toggle there would
	// collapse an already-open section out from under whatever the action just
	// revealed.
	function handleHeaderClick(event) {
		if (!collapsible) return;
		const inAction = event.target.closest('.header-actions') && !event.target.closest('.chevron');
		expanded = inAction ? true : !expanded;
	}

	function handleKeydown(event) {
		if (!collapsible) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			expanded = !expanded;
		}
	}
</script>

<section class="section">
	<!--
		The header is only focusable and only carries a role when the section can
		actually be toggled — a fixed header announcing itself as a button, or
		sitting in the tab order doing nothing, is worse than a plain heading.
	-->
	{#if collapsible}
		<div
			class="header"
			onclick={handleHeaderClick}
			onkeydown={handleKeydown}
			role="button"
			aria-expanded={expanded}
			tabindex="0"
		>
			{@render headerContent()}
		</div>
	{:else}
		<div class="header static">{@render headerContent()}</div>
	{/if}

	<div class="body-wrapper" class:collapsed={!expanded}>
		<div class="body">
			{@render children()}
		</div>
	</div>
</section>

{#snippet headerContent()}
	<h3>
		{title}
		{#if info}<InfoTip text={info} />{/if}
	</h3>
	<div class="header-actions">
		{#if action}
			{@render action()}
		{/if}
		{#if showChevron}
			<span class="chevron" class:collapsed={!expanded}>
				<IconChevronDown size={12} />
			</span>
		{/if}
	</div>
{/snippet}

<style>
	.section {
		border-top: 1px solid var(--editor-color-panel-border);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--editor-space-xs);
		height: 32px;
		padding: 0 var(--editor-space-md);
		cursor: pointer;
	}

	.header.static {
		cursor: default;
	}

	h3 {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		font-size: var(--editor-control-font-size);
		font-weight: 500;
		line-height: 1;
		color: var(--editor-color-heading);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--editor-space-sm);
	}

	.chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--editor-color-text-muted);
		transition: transform var(--editor-section-duration) ease;
	}

	.chevron.collapsed {
		transform: rotate(-90deg);
	}

	/* Animating to `height: auto` needs `interpolate-size: allow-keywords`,
	   which editor.css sets on `.editor`. Where the browser doesn't support it
	   the section still opens and closes — it just snaps. */
	.body-wrapper {
		height: auto;
		overflow: hidden;
		transition: height var(--editor-section-duration) ease;
	}

	.body-wrapper.collapsed {
		height: 0;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 var(--editor-space-md) 8px;
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron,
		.body-wrapper {
			transition: none;
		}
	}
</style>
