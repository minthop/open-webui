<script lang="ts">
	// mabi: 録画と派生物（変換・CM 抜き・文字起こし・要約・場面・索引。ADR 0035）
	import { onMount } from 'svelte';
	import { getJson, epgUrl, fmtDateTime, type Loaded } from '$lib/mabi/api';
	import Dedupe from './Dedupe.svelte';

	let recorded: Loaded<any[]> | null = null;
	let query = '';

	onMount(async () => {
		recorded = await getJson<any[]>('/api/recorded/detail');
	});

	const DERIVED: [string, string][] = [
		['video', '変換'],
		['video_cm_cut', 'CM 抜き'],
		['transcript', '文字起こし'],
		['summary', '要約'],
		['scenes', '場面'],
		['index', '索引']
	];
</script>

<Dedupe />

<h2>録画と派生物</h2>
<label for="mabi-rec-q"><strong>番組名で絞り込む</strong></label>
<p class="support">名前の一部を入力すると、下の一覧がその場で絞り込まれます</p>
<input
	id="mabi-rec-q"
	type="search"
	bind:value={query}
	style="min-height: 48px; width: 100%; max-width: 480px; border: 1px solid var(--dads-border-field); border-radius: 8px; padding: 0 16px; margin-bottom: 16px"
/>

{#if recorded === null}
	<p role="status">読み込んでいます</p>
{:else if !recorded.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊録画を読み込めません</strong>{recorded.error}
	</div>
{:else}
	{@const list = recorded.data.filter((m) => !query || (m.name ?? '').includes(query))}
	<p role="status">全{list.length}件</p>
	{#each list.slice(0, 50) as m}
		<section class="mabi-card" style="margin-bottom: 16px">
			<h3 style="margin-top: 0">
				{#if m.recorded_id}
					<a href={epgUrl(`/recorded/detail/${m.recorded_id}`)} target="_blank" rel="noopener"
						>{m.name}</a
					>
				{:else}{m.name}{/if}
			</h3>
			<p class="support">
				{fmtDateTime(m.start_at)}・{m.channel ?? ''}{m.duration_s
					? `・${Math.round(m.duration_s / 60)}分`
					: ''}
				{#if m.drop_cnt > 0}<span class="mabi-chip warn">＊ドロップ {m.drop_cnt}</span>{/if}
				{#if m.duplicate_of?.length}<span class="mabi-chip muted">重複の候補あり</span>{/if}
			</p>
			<p>
				{#each DERIVED as [k, label]}
					<span class="mabi-chip {m.derived?.[k] ? 'ok' : 'muted'}" style="margin: 0 8px 4px 0"
						>{m.derived?.[k] ? 'あり' : 'なし'}: {label}</span
					>
				{/each}
			</p>
			{#if m.summary_head}
				<details>
					<summary>要約（冒頭 400 字）</summary>
					<p class="mabi-pre">{m.summary_head}</p>
				</details>
			{/if}
		</section>
	{:else}
		<p>まだありません</p>
	{/each}
	{#if list.length > 50}<p class="support">先頭の 50 件を表示しています</p>{/if}
{/if}
