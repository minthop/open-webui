<script lang="ts">
	// mabi: サーバーの画面（PC の状態・予定と実績・番組・録画・台帳・報告。ADR 0035）。
	// データは mabi-web の読み取り専用の JSON（/mabi-api/）。デザインはデジタル庁デザインシステムに合わせる
	import { getContext, onMount, tick } from 'svelte';
	import { WEBUI_NAME, showSidebar } from '$lib/stores';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import SidebarIcon from '$lib/components/icons/Sidebar.svelte';
	import Overview from '$lib/components/mabi/Overview.svelte';
	import Week from '$lib/components/mabi/Week.svelte';
	import Tv from '$lib/components/mabi/Tv.svelte';
	import Recorded from '$lib/components/mabi/Recorded.svelte';
	import Models from '$lib/components/mabi/Models.svelte';
	import Reports from '$lib/components/mabi/Reports.svelte';
	import '$lib/mabi/mabi.css';

	const i18n = getContext<any>('i18n');

	const TABS = [
		{ id: 'overview', label: '状態とキュー', component: Overview },
		{ id: 'week', label: '1 週間の予定と実績', component: Week },
		{ id: 'tv', label: '番組', component: Tv },
		{ id: 'recorded', label: '録画と派生物', component: Recorded },
		{ id: 'models', label: 'モデルの台帳', component: Models },
		{ id: 'reports', label: '報告', component: Reports }
	];
	const KEY = 'mabi.tab';

	let current = TABS[0].id;

	onMount(() => {
		// 前に開いていたタブを残す
		const saved = localStorage.getItem(KEY);
		if (saved && TABS.some((t) => t.id === saved)) current = saved;
	});

	const select = async (id: string, focus = false) => {
		current = id;
		localStorage.setItem(KEY, id);
		if (focus) {
			await tick();
			document.getElementById(`mabi-tab-${id}`)?.focus();
		}
	};

	// 矢印キー・Home・End でタブを移る（WAI-ARIA の tabs）
	const onKey = (e: KeyboardEvent) => {
		const i = TABS.findIndex((t) => t.id === current);
		const next =
			e.key === 'ArrowRight'
				? (i + 1) % TABS.length
				: e.key === 'ArrowLeft'
					? (i - 1 + TABS.length) % TABS.length
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? TABS.length - 1
							: -1;
		if (next >= 0) {
			e.preventDefault();
			select(TABS[next].id, true);
		}
	};

	$: active = TABS.find((t) => t.id === current) ?? TABS[0];
</script>

<svelte:head>
	<!-- LICENSE covers this Open WebUI browser-title identifier.
	Do not alter, remove, obscure, or replace it except as LICENSE permits:
	https://docs.openwebui.com/license. -->
	<title>
		サーバー / {$WEBUI_NAME}
	</title>
</svelte:head>

<div
	class="flex flex-col w-full h-screen max-h-[100dvh] overflow-y-auto {$showSidebar
		? 'md:max-w-[calc(100%-var(--sidebar-width))]'
		: ''} max-w-full"
>
	{#if !$showSidebar}
		<div class="px-2 pt-2">
			<Tooltip content={$i18n.t('Open Sidebar')}>
				<button
					class="cursor-pointer flex rounded-lg hover:bg-gray-100 transition p-1.5"
					aria-label={$i18n.t('Open Sidebar')}
					on:click={() => showSidebar.set(true)}
				>
					<SidebarIcon className="size-4" />
				</button>
			</Tooltip>
		</div>
	{/if}

	<main class="mabi">
		<h1>サーバー（mabi）</h1>
		<div class="mabi-tabs" role="tablist" aria-label="表示する内容">
			{#each TABS as t}
				<button
					id="mabi-tab-{t.id}"
					role="tab"
					type="button"
					aria-selected={t.id === current}
					aria-controls="mabi-panel"
					tabindex={t.id === current ? 0 : -1}
					on:click={() => select(t.id)}
					on:keydown={onKey}>{t.label}</button
				>
			{/each}
		</div>
		<div id="mabi-panel" role="tabpanel" aria-labelledby="mabi-tab-{active.id}">
			{#key active.id}
				<svelte:component this={active.component} />
			{/key}
		</div>
		<p class="support" style="margin-top: 64px">
			この画面は Open WebUI のフォーク（minthop/open-webui）で追加したものです。公式の Open WebUI
			の機能ではありません。
		</p>
	</main>
</div>
