<script lang="ts">
	// mabi: 通知と自動実行の報告、PR・CI・Release（ADR 0035）
	import { onMount } from 'svelte';
	import { getJson, fmtDateTime, type Loaded } from '$lib/mabi/api';

	let activity: Loaded<any> | null = null;
	let github: Loaded<any> | null = null;

	onMount(async () => {
		[activity, github] = await Promise.all([getJson('/api/activity'), getJson('/api/github')]);
	});

	const okWord = (r: string) => /^(ok|成功|完了|done)/i.test(r ?? '');
	const ngWord = (r: string) => /(失敗|エラー|戻した|revert|fail)/i.test(r ?? '');
</script>

<h2>自動で実行したこと</h2>
<p class="support">AI と root が承認なしで実行した操作（L2）の記録です。新しい順に 100 件まで</p>
{#if activity === null}
	<p role="status">読み込んでいます</p>
{:else if !activity.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊読み込めません</strong>{activity.error}
	</div>
{:else}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>日時</th><th>実行したもの</th><th>操作</th><th>結果</th></tr></thead>
			<tbody>
				{#each activity.data.auto as a}
					<tr>
						<td>{fmtDateTime(a.at * 1000)}</td>
						<td>{a.actor}<br /><span class="support">{a.source}</span></td>
						<td>{a.action}</td>
						<td>
							{#if ngWord(a.result)}<span class="mabi-chip ng">＊要確認</span>
							{:else if okWord(a.result)}<span class="mabi-chip ok">完了</span>{/if}
							{a.result}
						</td>
					</tr>
				{:else}
					<tr><td colspan="4">まだありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2>通知</h2>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>重さ</th><th>種類</th><th>内容</th></tr></thead>
			<tbody>
				{#each activity.data.notifications as n}
					<tr>
						<td>
							<span
								class="mabi-chip {n.level === 'critical'
									? 'ng'
									: n.level === 'warn'
										? 'warn'
										: 'info'}"
								>{n.level === 'critical'
									? '＊重大'
									: n.level === 'warn'
										? '注意'
										: 'お知らせ'}</span
							>
						</td>
						<td>{n.kind ?? ''}</td>
						<td>{n.message ?? ''}</td>
					</tr>
				{:else}
					<tr><td colspan="3">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<h2>PR・CI・Release</h2>
{#if github === null}
	<p role="status">読み込んでいます</p>
{:else if !github.ok || github.data === null}
	<p class="support">まだありません（pr watch が GitHub の状態を書くと表示されます）</p>
{:else}
	{@const g = github.data}
	<p>
		最新の Release: {g.latest_release?.tagName ?? '—'}
		{g.latest_release?.publishedAt
			? `（${fmtDateTime(Date.parse(g.latest_release.publishedAt))}）`
			: ''}
	</p>
	<h3>開いている PR</h3>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>番号</th><th>題名</th><th>作者</th></tr></thead>
			<tbody>
				{#each g.open_prs ?? [] as p}
					<tr>
						<td class="num">#{p.number}</td>
						<td>{p.title}{p.isDraft ? '（ドラフト）' : ''}</td>
						<td>{p.author?.login ?? ''}</td>
					</tr>
				{:else}
					<tr><td colspan="3">ありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<h3>main の CI</h3>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>workflow</th><th>日時</th><th>結果</th></tr></thead>
			<tbody>
				{#each g.main_runs ?? [] as r}
					<tr>
						<td>{r.workflowName}</td>
						<td>{r.createdAt ? fmtDateTime(Date.parse(r.createdAt)) : ''}</td>
						<td>
							<span
								class="mabi-chip {r.conclusion === 'success' ? 'ok' : r.conclusion ? 'ng' : 'info'}"
								>{r.conclusion === 'success'
									? '成功'
									: r.conclusion
										? `＊${r.conclusion}`
										: (r.status ?? '実行中')}</span
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
