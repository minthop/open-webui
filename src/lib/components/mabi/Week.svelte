<script lang="ts">
	// mabi: CPU と GPU の 1 週間（予定 = 録画の予約とタイマー、実績 = 過去 7 日に実際に動いたもの。ADR 0035）
	import { onMount } from 'svelte';
	import {
		getJson,
		fmtDay,
		fmtHm,
		fmtSeconds,
		jstDayStart,
		resultLabel,
		resourceLabel,
		type Loaded
	} from '$lib/mabi/api';
	import { KIND_COLORS, KIND_LABELS } from './kinds';

	const DAY = 86_400_000;
	/** 終わりの分からない予定（タイマー）は 10 分の幅で描く */
	const NOMINAL = 10 * 60_000;

	let week: Loaded<any> | null = null;

	onMount(async () => {
		week = await getJson('/api/week');
	});

	type Item = {
		start_ms: number;
		end_ms: number | null;
		kind: string;
		kind_label: string;
		resource: string;
		title: string;
		source: string;
		result: string | null;
	};

	const TRACKS: ['cpu' | 'gpu', string][] = [
		['cpu', 'CPU'],
		['gpu', 'GPU']
	];

	const onTrack = (it: Item, res: 'cpu' | 'gpu') => it.resource === res || it.resource === 'both';

	const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * DAY);

	const inDay = (items: Item[], day: number, now: number) =>
		items.filter((it) => {
			const end = it.end_ms ?? (it.result === 'running' ? now : it.start_ms + NOMINAL);
			return it.start_ms < day + DAY && end > day;
		});

	const blockStyle = (it: Item, day: number, now: number) => {
		const end = it.end_ms ?? (it.result === 'running' ? now : it.start_ms + NOMINAL);
		const s = Math.max(it.start_ms, day);
		const e = Math.min(end, day + DAY);
		const left = ((s - day) / DAY) * 100;
		const width = Math.max(((e - s) / DAY) * 100, 0.3);
		const color = KIND_COLORS[it.kind] ?? '#949494';
		const dashed = it.end_ms === null && it.result !== 'running';
		return `left:${left}%;width:${width}%;background:${color};${dashed ? 'opacity:0.7;border-style:dashed;' : ''}`;
	};

	const tip = (it: Item) =>
		`${it.kind_label}: ${it.title} ${fmtHm(it.start_ms)}〜${it.end_ms ? fmtHm(it.end_ms) : ''}${
			it.result ? `（${resultLabel(it.result)}）` : ''
		}`;
</script>

{#if week === null}
	<p role="status">読み込んでいます</p>
{:else if !week.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊1 週間の予定と実績を読み込めません</strong>{week.error}
	</div>
{:else}
	{@const w = week.data}
	{@const now = w.now_ms}
	{@const today = jstDayStart(now)}
	<div class="mabi-legend" aria-label="凡例">
		{#each Object.keys(KIND_LABELS) as k}
			<span
				><span class="mabi-swatch" style="background:{KIND_COLORS[k]}"></span>{KIND_LABELS[k]}</span
			>
		{/each}
		<span>破線: 終わりの時刻が分からない予定（10 分の幅で表示）</span>
	</div>

	{#each [{ title: '予定（今日から 7 日。録画の予約とタイマー）', list: w.planned, from: today }, { title: '実績（過去 7 日に実際に動いたもの）', list: w.actual, from: today - 6 * DAY }] as sec}
		<h2>{sec.title}</h2>
		{#each days(sec.from, 7) as day}
			{@const items = inDay(sec.list, day, now)}
			<h3>{fmtDay(day)}</h3>
			{#each TRACKS as [res, label]}
				<div class="mabi-day">
					<span>{label}</span>
					<div
						class="mabi-track"
						role="img"
						aria-label="{fmtDay(day)} の {label}: {items.filter((it) => onTrack(it, res))
							.length} 件"
					>
						{#each [3, 6, 9, 12, 15, 18, 21] as h}
							<span class="hour" style="left:{(h / 24) * 100}%"></span>
						{/each}
						{#each items.filter((it) => onTrack(it, res)) as it}
							<span class="block" style={blockStyle(it, day, now)} title={tip(it)}></span>
						{/each}
					</div>
				</div>
			{/each}
			{#if items.length}
				<details>
					<summary>{items.length} 件の内訳</summary>
					<div class="mabi-table-scroll">
						<table class="mabi-table">
							<thead>
								<tr><th>時刻</th><th>種類</th><th>資源</th><th>内容</th><th>結果</th></tr>
							</thead>
							<tbody>
								{#each items as it}
									<tr>
										<td>{fmtHm(it.start_ms)}〜{it.end_ms ? fmtHm(it.end_ms) : ''}</td>
										<td>{it.kind_label}</td>
										<td>{resourceLabel(it.resource)}</td>
										<td>{it.title}</td>
										<td>
											{#if it.result}
												<span
													class="mabi-chip {it.result === 'success'
														? 'ok'
														: it.result === 'failed'
															? 'ng'
															: it.result === 'running'
																? 'info'
																: 'muted'}"
													>{it.result === 'failed' ? '＊' : ''}{resultLabel(it.result)}</span
												>
											{:else}予定{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{/if}
		{/each}
	{/each}

	<h2>定期の仕事（間隔で動くもの）</h2>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>仕事</th><th>種類</th><th>資源</th><th>間隔</th></tr></thead>
			<tbody>
				{#each w.periodic as p}
					<tr>
						<td>{p.unit}</td>
						<td>{p.kind_label}</td>
						<td>{resourceLabel(p.resource)}</td>
						<td>{fmtSeconds(p.every_s)}ごと</td>
					</tr>
				{:else}
					<tr><td colspan="4">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if w.generated_at === null}
		<div class="mabi-banner info">
			<strong>タイマーと実績の写しがありません</strong
			>録画の予約だけを表示しています（mabi-dashboard.timer を確認してください）
		</div>
	{/if}
{/if}
