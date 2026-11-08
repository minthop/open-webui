<script lang="ts">
	// mabi: 同じ内容の録画（削除の予定・確認待ち・消さないもの・消したもの・除外したルール予約。ADR 0038）
	import { onMount } from 'svelte';
	import { getJson, epgUrl, fmtDateTime, fmtSeconds, type Loaded } from '$lib/mabi/api';

	let data: Loaded<any> | null = null;

	onMount(async () => {
		data = await getJson('/api/dedupe');
	});

	/** 録画の stem の日時（YYYYMMDD-HHMM、日本時間）→「11/1 21:00」 */
	const stemAt = (at?: string | null): string => {
		const m = at?.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
		return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : '—';
	};
	/** 録画の stem の番組名は記号を _ にしてあるので、表示では空白に戻す */
	const nm = (n?: string | null): string => (n ?? '—').replaceAll('_', ' ');
	const pct = (s?: number | null): string => (s == null ? '—' : `${Math.round(s * 100)}%`);
</script>

{#snippet rec(r: any)}
	{#if r?.recorded_id}
		<a href={epgUrl(`/recorded/detail/${r.recorded_id}`)} target="_blank" rel="noopener"
			>{nm(r.name)}</a
		>
	{:else}{nm(r?.name)}{/if}
	<span class="support">（{stemAt(r?.at)}）</span>
{/snippet}

<h2>重複の候補</h2>
<p class="support">
	前の録画と同じ内容と判定した録画は、見つけてから一定時間後に後から録った方を消します。消したくない録画は、番組名のリンクから
	EPGStation で保護してください（保護した録画は消しません）。
</p>

{#if data === null}
	<p role="status">読み込んでいます</p>
{:else if !data.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊重複の候補を読み込めません</strong>{data.error}
	</div>
{:else}
	{@const d = data.data}
	<h3>削除の予定</h3>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead>
				<tr><th>消す録画（後から録った方）</th><th>残す録画</th><th>重なり</th><th>消す時刻</th></tr
				>
			</thead>
			<tbody>
				{#each d.pending ?? [] as p}
					<tr>
						<td>{@render rec(p.later)}</td>
						<td>{@render rec(p.earlier)}</td>
						<td class="num">{pct(p.score)}</td>
						<td>
							{fmtDateTime(p.delete_at * 1000)}<br /><span class="support"
								>あと {fmtSeconds(p.delete_in_s)}</span
							>
						</td>
					</tr>
				{:else}
					<tr><td colspan="4">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if (d.waiting ?? []).length}
		<h3>確認待ち</h3>
		<p class="support">
			候補を見つけ、まだ root が測り直していないものです（1 時間以内に確認します）
		</p>
		<ul>
			{#each d.waiting as w}
				<li>{@render rec(w.later)} ≒ {@render rec(w.earlier)}・重なり {pct(w.score)}</li>
			{/each}
		</ul>
	{/if}

	<details>
		<summary>消さないと決めたもの（{(d.rejected ?? []).length} 件）</summary>
		<ul>
			{#each d.rejected ?? [] as r}
				<li>{@render rec(r.later)}：{r.reason}</li>
			{:else}
				<li>ありません</li>
			{/each}
		</ul>
	</details>

	<details>
		<summary>最近消したもの（{(d.deleted ?? []).length} 件）</summary>
		<ul>
			{#each d.deleted ?? [] as r}
				<li>
					{nm(r.later?.name ?? r.later?.stem)}（{stemAt(r.later?.at)}）・{fmtDateTime(r.at * 1000)} に削除
				</li>
			{:else}
				<li>ありません</li>
			{/each}
		</ul>
	</details>

	<details>
		<summary>除外したルール予約（{(d.skipped ?? []).length} 件）</summary>
		<p class="support">EPGStation の予約の画面で除外を解除できます</p>
		<ul>
			{#each d.skipped ?? [] as s}
				<li>{s.name}：{s.reason}・{fmtDateTime(s.at * 1000)}</li>
			{:else}
				<li>ありません</li>
			{/each}
		</ul>
	</details>
{/if}
