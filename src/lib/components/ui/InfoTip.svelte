<script>
	import { Tooltip } from 'bits-ui';
	import { IconInfoCircle } from '@tabler/icons-svelte-runes';

	let { text, side = 'left' } = $props();
</script>

<!--
	The explanation for a control, parked behind an icon instead of set in a
	paragraph under it. A 280px panel can only carry so much prose before the
	controls stop being findable, and most hints are read once and never again.

	Portalled (bits-ui does this for us) because the sidebar scrolls: `overflow-y:
	auto` computes `overflow-x` to `auto` as well, so a tooltip positioned inside
	it would be clipped at the panel edge. `side="left"` for the same reason —
	there is nothing but panel to the right.
-->
<Tooltip.Provider delayDuration={200}>
	<Tooltip.Root>
		<!--
			The icon often sits inside something clickable (a Section header
			toggles on click), and reaching for an explanation should never also
			fold the thing away.
		-->
		<Tooltip.Trigger
			class="info-trigger"
			aria-label={text}
			onclick={(event) => event.stopPropagation()}
		>
			<IconInfoCircle size={13} />
		</Tooltip.Trigger>
		<Tooltip.Portal>
			<Tooltip.Content {side} sideOffset={6} class="info-tip">
				{text}
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>

<style>
	/* Both are bits-ui's own elements, so they are styled from here through
	   :global rather than with scoped classes. */
	:global(.info-trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: none;
		color: var(--color-text-muted);
		cursor: help;
		opacity: 0.6;
	}

	:global(.info-trigger:hover),
	:global(.info-trigger:focus-visible) {
		color: var(--color-text);
		opacity: 1;
	}

	:global(.info-tip) {
		z-index: 100;
		max-width: 220px;
		padding: 6px 8px;
		border: 1px solid var(--color-panel-border);
		border-radius: var(--radius-sm);
		background: var(--color-panel);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		color: var(--color-text);
		font-size: 11px;
		line-height: 1.45;
	}
</style>
