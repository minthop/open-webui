<script lang="ts">
	// mabi: CPU と GPU の 1 週間（予定 = 録画の予約とタイマー、実績 = 過去 7 日に実際に動いたもの。ADR 0035）。
	// CPU は物理コアごとの行（Mabi ADR 0090 の予約に合わせる。ADR 0094）
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
	import { lanes, coresLabel, type WeekItem } from '$lib/mabi/lanes';

	const DAY = 86_400_000;
	/** 終わりの分からない予定（タイマー）は 10 分の幅で描く */
	const NOMINAL = 10 * 60_000;

	let week: Loaded<any> | null = null;

	onMount(async () => {
		week = await getJson('/api/week');
	});

	type Item = WeekItem;

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
		`${it.kind_label}: ${it.title} ${fmtHm(it.start_ms)}〜${it.end_ms ? fmtHm(it.end_ms) : ''}（${coresLabel(
			it,
			resourceLabel,
			week && week.ok ? week.data?.cpu : null
		)}）${it.result ? `（${resultLabel(it.result)}）` : ''}`;
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
	{#if w.cpu?.mode === 'priority'}
		<p>
			CPU
			は優先度の段ごとの行です。コアは固定せず全コアを共有し、取り合いになったときだけ段の重みで分けます（上の段ほど優先）。GPU
			は作業ごとに要る VRAM を予約し、合計が予算に収まる間は同時に動きます。
		</p>
	{:else if w.cpu}
		<p>
			CPU は物理コアごとの行です。コア {w.cpu.reserved_core} は OS・録画・常駐に固定し、ほかのコアは作業ごとに予約します。予定はどのコアになるかが始まるときに決まるので、予約するコアを
			1 行にまとめています。
		</p>
	{/if}

	{#each [{ title: '予定（今日から 7 日。録画の予約とタイマー）', list: w.planned, from: today, rows: lanes(w.cpu, true) }, { title: '実績（過去 7 日に実際に動いたもの）', list: w.actual, from: today - 6 * DAY, rows: lanes(w.cpu, false) }] as sec}
		<h2>{sec.title}</h2>
		{#each days(sec.from, 7) as day}
			{@const items = inDay(sec.list, day, now)}
			<h3>{fmtDay(day)}</h3>
			{#each sec.rows as lane (lane.key)}
				{@const on = items.filter(lane.match)}
				{#if !lane.optional || on.length}
					<div class="mabi-day">
						<span title={lane.note}>{lane.label}</span>
						<div
							class="mabi-track"
							role="img"
							aria-label="{fmtDay(day)} の {lane.label}{lane.note
								? `（${lane.note}）`
								: ''}: {on.length} 件"
						>
							{#each [3, 6, 9, 12, 15, 18, 21] as h}
								<span class="hour" style="left:{(h / 24) * 100}%"></span>
							{/each}
							{#each on as it}
								<span class="block" style={blockStyle(it, day, now)} title={tip(it)}></span>
							{/each}
						</div>
					</div>
				{/if}
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
										<td>{coresLabel(it, resourceLabel, w.cpu)}</td>
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
