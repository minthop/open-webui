<script lang="ts">
	// mabi: 番組（今と数時間後・おすすめ・予約・録画の一部）と EPGStation へのリンク（ADR 0035）
	import { onMount } from 'svelte';
	import { getJson, epgUrl, fmtDateTime, fmtHm, type Loaded } from '$lib/mabi/api';

	let schedules: Loaded<any[]> | null = null;
	let week: Loaded<any> | null = null;
	let recorded: Loaded<any[]> | null = null;
	let recommend: Loaded<any> | null = null;

	onMount(async () => {
		[schedules, week, recorded, recommend] = await Promise.all([
			getJson<any[]>('/api/schedules'),
			getJson('/api/week'),
			getJson<any[]>('/api/recorded/detail'),
			getJson('/api/recommend')
		]);
	});

	const nowMs = Date.now();
</script>

<p>
	EPGStation:
	<a href={epgUrl('/guide')} target="_blank" rel="noopener">番組表</a>・
	<a href={epgUrl('/onair')} target="_blank" rel="noopener">放送中</a>・
	<a href={epgUrl('/reserves')} target="_blank" rel="noopener">予約</a>・
	<a href={epgUrl('/recorded')} target="_blank" rel="noopener">録画済み</a>
	<span class="support">（新しいタブで開きます）</span>
</p>

<h2>おすすめ</h2>
{#if recommend === null}
	<p role="status">読み込んでいます</p>
{:else if !recommend.ok}
	<p class="support">おすすめはまだありません（AI の調査が動くと表示されます）</p>
{:else}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>放送</th><th>番組</th><th>理由</th><th>状態</th></tr></thead>
			<tbody>
				{#each recommend.data.items ?? [] as r}
					<tr>
						<td>{fmtDateTime(r.start_ms)}<br />{r.channel ?? ''}</td>
						<td>{r.name}</td>
						<td>{r.reason ?? ''}</td>
						<td>{r.status_label ?? ''}</td>
					</tr>
				{:else}
					<tr><td colspan="4">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<h2>今と数時間後の放送</h2>
{#if schedules === null}
	<p role="status">読み込んでいます</p>
{:else if !schedules.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊番組表を読み込めません</strong>{schedules.error}
	</div>
{:else}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>局</th><th>番組（終わっていないもの 4 件まで）</th></tr></thead>
			<tbody>
				{#each schedules.data as s}
					<tr>
						<td>{s.channel?.name ?? ''}</td>
						<td>
							{#each (s.programs ?? []).filter((p: any) => p.endAt > nowMs).slice(0, 4) as p}
								{fmtHm(p.startAt)}
								{p.name}
								{#if p.startAt <= nowMs}<span class="mabi-chip info">放送中</span>{/if}<br />
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<h2>予約（次の 10 件）</h2>
{#if week?.ok}
	{@const rs = (week.data.planned ?? []).filter((p: any) => p.source === 'epgstation').slice(0, 10)}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>開始</th><th>終了</th><th>番組</th></tr></thead>
			<tbody>
				{#each rs as r}
					<tr><td>{fmtDateTime(r.start_ms)}</td><td>{fmtHm(r.end_ms)}</td><td>{r.title}</td></tr>
				{:else}
					<tr><td colspan="3">予約はありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if week}
	<div class="mabi-banner error" role="alert">
		<strong>＊予約を読み込めません</strong>{week.error}
	</div>
{:else}
	<p role="status">読み込んでいます</p>
{/if}

<h2>最近の録画（10 件）</h2>
{#if recorded?.ok}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>放送</th><th>番組</th><th>要約の冒頭</th></tr></thead>
			<tbody>
				{#each recorded.data.slice(0, 10) as m}
					<tr>
						<td>{fmtDateTime(m.start_at)}<br />{m.channel ?? ''}</td>
						<td>
							{#if m.recorded_id}
								<a href={epgUrl(`/recorded/detail/${m.recorded_id}`)} target="_blank" rel="noopener"
									>{m.name}</a
								>
							{:else}{m.name}{/if}
						</td>
						<td>{(m.summary_head ?? '').slice(0, 120)}</td>
					</tr>
				{:else}
					<tr><td colspan="3">まだありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else if recorded}
	<div class="mabi-banner error" role="alert">
		<strong>＊録画を読み込めません</strong>{recorded.error}
	</div>
{:else}
	<p role="status">読み込んでいます</p>
{/if}
