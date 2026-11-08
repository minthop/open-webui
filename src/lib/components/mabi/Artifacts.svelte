<script lang="ts">
	// mabi: 成果物（AI が作ったプログラム・文書）。実行中の表示・テストと実行の結果・.md の表示・実行のボタン（Mabi ADR 0036）
	import { onMount, onDestroy } from 'svelte';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { getJson, fmtDateTime, type Loaded } from '$lib/mabi/api';

	let list: Loaded<any> | null = null;
	let open: { id: string; name: string; text: string; md: boolean } | null = null;
	let openError = '';
	let message = '';
	let timer: ReturnType<typeof setInterval> | undefined;

	const load = async () => {
		list = await getJson('/api/artifacts');
	};

	onMount(() => {
		load();
		timer = setInterval(load, 10_000);
	});
	onDestroy(() => clearInterval(timer));

	const STATE: Record<string, [string, string]> = {
		running: ['実行中', 'info'],
		passed: ['成功', 'ok'],
		failed: ['＊失敗', 'ng'],
		timeout: ['＊時間切れ（300 秒）', 'ng'],
		error: ['＊実行できない', 'ng']
	};

	const show = async (id: string, name: string) => {
		openError = '';
		const r = await getJson(`/api/artifacts/${id}/file/${encodeURIComponent(name)}`);
		if (r.ok) {
			open = { id, name, text: r.data.text, md: name.endsWith('.md') };
		} else {
			open = null;
			openError = `＊${name} を開けません（${r.error}）`;
		}
	};

	const run = async (id: string, title: string) => {
		message = '';
		try {
			const res = await fetch(`/mabi-tools/artifacts/${id}/run`, { method: 'POST' });
			const v = await res.json().catch(() => ({}));
			message = !res.ok
				? `＊「${title}」の実行を依頼できません（${v.error ?? res.status}）`
				: v.queued
					? `「${title}」の実行を依頼しました。隔離した環境で動きます（300 秒まで）`
					: `「${title}」は既に実行を待っています`;
		} catch (e) {
			message = `＊「${title}」の実行を依頼できません（${e}）`;
		}
		await load();
	};
</script>

<h2>成果物</h2>
<p class="support">
	AI
	が作ったプログラムと文書です。プログラムは中身が変わると自動でテストと実行をします。実行は外につながらない隔離した環境で行い、ファイルは変えません。
</p>
<div role="status" aria-live="polite">
	{#if message}
		<div class="mabi-banner {message.startsWith('＊') ? 'error' : 'info'}">{message}</div>
	{/if}
</div>

{#if list === null}
	<p role="status">読み込んでいます</p>
{:else if !list.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊成果物を読み込めません</strong>{list.error}
	</div>
{:else}
	{@const d = list.data}
	<h3>実行中</h3>
	<p>
		{#each d.running as r}
			<span class="mabi-chip info" style="margin-right: 8px"
				>実行中: {r.id}（{r.mode === 'test' ? 'テスト' : '実行'}）</span
			>
		{:else}
			実行中の成果物はありません
		{/each}
	</p>

	{#each d.items as it}
		{@const m = it.manifest}
		<section class="mabi-card" style="margin-bottom: 16px">
			<h3 style="margin-top: 0">{m?.title ?? it.id}</h3>
			<p class="support">
				{it.id}・{m ? (m.kind === 'python' ? 'プログラム' : '文書') : ''}
				{#if it.error}<span class="mabi-chip ng">＊宣言が不正: {it.error}</span>{/if}
			</p>
			{#if m?.kind === 'python'}
				<table class="mabi-table" style="margin-bottom: 8px">
					<thead><tr><th>種類</th><th>状態</th><th>終わった日時</th><th>依頼</th></tr></thead>
					<tbody>
						{#each [['test', 'テスト'], ['run', '実行']] as [k, label]}
							{@const s = it[k]}
							<tr>
								<td>{label}</td>
								<td>
									{#if it.queued[k]}<span class="mabi-chip muted">待ち</span>{/if}
									{#if s}
										{@const st = STATE[s.state] ?? [s.state, 'muted']}
										<span class="mabi-chip {st[1]}">{st[0]}</span>
										{#if s.exit_code !== null && s.exit_code !== undefined}（終了コード {s.exit_code}）{/if}
									{:else if !it.queued[k]}—{/if}
								</td>
								<td>{s?.finished_at ? fmtDateTime(s.finished_at * 1000) : '—'}</td>
								<td>{s ? (s.by === 'manual' ? '手動' : '自動') : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#each ['test', 'run'] as k}
					{#if it[k]?.output}
						<details>
							<summary>{k === 'test' ? 'テスト' : '実行'}の出力（末尾）</summary>
							<pre class="mabi-pre">{it[k].output}</pre>
						</details>
					{/if}
				{/each}
				{#if m.entry}
					<p style="margin-top: 8px">
						<button
							type="button"
							on:click={() => run(it.id, m.title)}
							style="min-height: 48px; padding: 0 24px; border-radius: 8px; font-weight: 700; background: var(--dads-key-900); color: #fff"
							>実行する</button
						>
						<!-- 押せないボタンは作らない（DADS）。待っている・実行中なら、押すと「既に待っています」と知らせる -->
					</p>
				{/if}
			{/if}
			<p>
				ファイル:
				{#each it.files as f}
					{#if f.viewable}
						<button
							type="button"
							class="mabi-chip info"
							style="margin: 0 8px 4px 0; cursor: pointer"
							on:click={() => show(it.id, f.name)}>{f.name}</button
						>
					{:else}
						<span class="mabi-chip muted" style="margin: 0 8px 4px 0">{f.name}</span>
					{/if}
				{/each}
			</p>
		</section>
	{:else}
		<p>まだ成果物はありません（AI が /srv/work/artifacts に置くと表示されます）</p>
	{/each}

	{#if openError}
		<div class="mabi-banner error" role="alert">{openError}</div>
	{/if}
	{#if open}
		<h2>{open.name}（{open.id}）</h2>
		{#if open.md}
			<div class="prose max-w-none">
				{@html DOMPurify.sanitize(marked.parse(open.text, { async: false }) as string)}
			</div>
		{:else}
			<pre class="mabi-pre">{open.text}</pre>
		{/if}
	{/if}
{/if}
