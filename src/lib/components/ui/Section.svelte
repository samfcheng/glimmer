<script>
	import { IconChevronDown } from '@tabler/icons-svelte-runes';
	import InfoTip from './InfoTip.svelte';

	let {
		title,
		// Optional one-line explanation, shown behind an "i" beside the title.
		info = null,
		action = null,
		children,
		collapsible = true,
		showChevron = collapsible,
		defaultExpanded = true,
		expanded = $bindable(defaultExpanded)
	} = $props();

	// Clicking anywhere in the header expands/collapses the section — except
	// clicking an action button (e.g. "Add particle") only ever force-opens
	// it, since a plain toggle would collapse an already-open section right
	// out from under whatever the action just revealed.
	function handleHeaderClick(event) {
		if (!collapsible) return;
		const inAction = event.target.closest('.header-actions') && !event.target.closest('.chevron');
		expanded = inAction ? true : !expanded;
	}

	function handleKeydown(event) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (collapsible) expanded = !expanded;
		}
	}
</script>

<section class="section">
	<div
		class="header"
		onclick={handleHeaderClick}
		onkeydown={handleKeydown}
		role="button"
		tabindex="0"
	>
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
	</div>
	<div class="body-wrapper" class:collapsed={!expanded}>
		<div class="body">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.section {
		border-top: 1px solid var(--color-panel-border);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		height: 32px;
		padding: 0 var(--space-md);
		cursor: pointer;
	}

	h3 {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		font-size: 12px;
		font-weight: 500;
		line-height: 1;
		color: var(--color-heading);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--color-text-muted);
		/* transition: transform 0.15s ease; */
	}

	.chevron.collapsed {
		transform: rotate(-90deg);
	}

	.body-wrapper {
		height: auto;
		overflow: hidden;
		/*transition: height 0.18s ease;*/
	}

	.body-wrapper.collapsed {
		height: 0;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 var(--space-md) 8px;
	}
</style>
