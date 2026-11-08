<script lang="ts">
	// mabi: モデルの台帳（役割・現行・担い始めた日・最近の仕事の要約・候補・ベンチの採否。ADR 0035）
	import { onMount } from 'svelte';
	import { getJson, fmtDateTime, type Loaded } from '$lib/mabi/api';

	let models: Loaded<any> | null = null;

	onMount(async () => {
		models = await getJson('/api/models');
	});

	const VERDICT: Record<string, [string, string]> = {
		Adopt: ['採用（入替の PR）', 'ok'],
		Hold: ['据え置き', 'muted'],
		NeedMore: ['件数を足して再判定', 'info'],
		Reject: ['＊採用しない', 'ng']
	};
	const pt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
</script>

{#if models === null}
	<p role="status">読み込んでいます</p>
{:else if !models.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊台帳を読み込めません</strong>{models.error}
	</div>
{:else if models.data.error}
	<div class="mabi-banner error" role="alert">
		<strong>＊台帳を読み込めません</strong>{models.data.error}
	</div>
{:else}
	{@const d = models.data}
	<p class="support">
		llama.cpp の版: {d.llama_build ?? '不明'}。要約は M0 が 1 日 1 回作ります（最終: {d.summaries_generated_at
			? fmtDateTime(d.summaries_generated_at * 1000)
			: 'まだ'}）
	</p>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead>
				<tr>
					<th>役割</th>
					<th>現行のモデル</th>
					<th>担い始めた日</th>
					<th>最近の仕事（直近 30 日）</th>
					<th>最後に仕事をした日時</th>
					<th>候補</th>
					<th>最後の判定</th>
				</tr>
			</thead>
			<tbody>
				{#each d.roles as r}
					{@const c = r.current}
					<tr>
						<th scope="row">{r.role}</th>
						<td>
							{#if c}{c.id}<br /><span class="support">{c.repo}（{c.quant}）</span>{:else}—{/if}
						</td>
						<td>{c?.since ?? '記録なし'}</td>
						<td>{c?.work?.summary ?? '—'}</td>
						<td>{c?.work?.last_ts ? fmtDateTime(c.work.last_ts * 1000) : '—'}</td>
						<td>
							{#each r.standby as s}<span class="mabi-chip info" style="margin: 0 4px 4px 0"
									>待機: {s}</span
								>{/each}
							{#each r.discovered as f}<span class="mabi-chip muted" style="margin: 0 4px 4px 0"
									>発見: {f.repo}</span
								>{/each}
							{#if !r.standby.length && !r.discovered.length}—{/if}
						</td>
						<td>
							{#if r.last_decision}
								{@const v = VERDICT[r.last_decision.verdict] ?? [r.last_decision.verdict, 'muted']}
								<span class="mabi-chip {v[1]}">{v[0]}</span><br />
								<span class="support">
									{r.last_decision.candidate}
									{#if r.last_decision.interval}
										・差 {pt(r.last_decision.interval.mean)} 点（{pt(
											r.last_decision.interval.lower
										)}〜{pt(r.last_decision.interval.upper)}）
									{/if}
									・{fmtDateTime(r.last_decision.ts * 1000)}
								</span>
							{:else}—{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2>退役したモデル</h2>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>モデル</th><th>退役日</th><th>最近の仕事</th></tr></thead>
			<tbody>
				{#each d.retired as m}
					<tr><td>{m.id}</td><td>{m.retired_on ?? '—'}</td><td>{m.work?.summary ?? '—'}</td></tr>
				{:else}
					<tr><td colspan="3">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
