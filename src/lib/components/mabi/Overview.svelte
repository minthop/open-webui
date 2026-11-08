<script lang="ts">
	// mabi: PC の状態・今の仕事・キュー（ADR 0035）
	import { onMount, onDestroy } from 'svelte';
	import { getJson, fmtDateTime, resourceLabel, type Loaded } from '$lib/mabi/api';

	let overview: Loaded<any> | null = null;
	let now: Loaded<any> | null = null;
	let queues: Loaded<any[]> | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;

	const load = async () => {
		[overview, now, queues] = await Promise.all([
			getJson('/api/overview'),
			getJson('/api/now'),
			getJson<any[]>('/api/queues')
		]);
	};

	onMount(() => {
		load();
		timer = setInterval(load, 30_000);
	});
	onDestroy(() => clearInterval(timer));

	const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
</script>

<h2>PC の状態</h2>
{#if overview === null}
	<p role="status">読み込んでいます</p>
{:else if !overview.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊PC の状態を読み込めません</strong>{overview.error}
	</div>
{:else}
	{@const s = overview.data}
	<div class="mabi-cards">
		<div class="mabi-card">
			<div class="label">電力（推定。CPU・GPU は実測）</div>
			{#if s.power}
				<div class="value">{Math.round(s.power.pct)}%</div>
				<div class="note">
					{Math.round(s.power.total_w)} W（CPU {Math.round(s.power.cpu_w)} W・GPU {Math.round(
						s.power.gpu_w
					)} W）。上限 {s.power.stop_pct}%
					{#if s.power.pct >= s.power.stop_pct}
						<span class="mabi-chip ng">＊上限を超えています</span>
					{/if}
				</div>
			{:else}
				<div class="value">—</div>
				<div class="note">写しがありません（mabi-dashboard.timer を確認）</div>
			{/if}
		</div>
		<div class="mabi-card">
			<div class="label">GPU</div>
			{#if s.gpu}
				<div class="value">{Math.round(s.gpu.util_pct)}%</div>
				<div class="note">
					VRAM {Math.round(s.gpu.mem_used_mb)} / {Math.round(s.gpu.mem_total_mb)} MiB（{pct(
						s.gpu.mem_used_mb,
						s.gpu.mem_total_mb
					)}%）・{Math.round(s.gpu.power_w)} W
				</div>
			{:else}
				<div class="value">—</div>
				<div class="note">取得できません</div>
			{/if}
		</div>
		<div class="mabi-card">
			<div class="label">メモリ</div>
			{#if s.mem}
				<div class="value">{Math.round(s.mem.total_gb - s.mem.avail_gb)} GB</div>
				<div class="note">
					{Math.round(s.mem.total_gb)} GB 中（空き {Math.round(s.mem.avail_gb)} GB）
				</div>
			{:else}
				<div class="value">—</div>
			{/if}
		</div>
		<div class="mabi-card">
			<div class="label">録画中</div>
			<div class="value">{s.recording?.length ?? 0} 件</div>
			<div class="note">
				{#each s.recording ?? [] as r}{r.name}<br />{/each}
			</div>
		</div>
	</div>

	<h3>ディスク</h3>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>場所</th><th>使用率</th><th>空き</th><th>容量</th></tr></thead>
			<tbody>
				{#each s.disks ?? [] as d}
					<tr>
						<td>{d.mount}</td>
						<td class="num">
							{d.used_pct}%
							{#if d.used_pct >= 90}<span class="mabi-chip ng">＊残りわずか</span>{/if}
						</td>
						<td class="num">{Math.round(d.avail_gb)} GB</td>
						<td class="num">{Math.round(d.size_gb)} GB</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h3>サービス</h3>
	<p>
		{#each s.services ?? [] as [name, active]}
			<span class="mabi-chip {active ? 'ok' : 'ng'}" style="margin: 0 8px 8px 0"
				>{active ? '稼働中' : '＊停止'}: {name}</span
			>
		{/each}
	</p>
{/if}

<h2>今の仕事</h2>
{#if now === null}
	<p role="status">読み込んでいます</p>
{:else if !now.ok}
	<div class="mabi-banner error" role="alert"><strong>＊読み込めません</strong>{now.error}</div>
{:else}
	<p>
		ロード中のモデル:
		{#if now.data.loaded_models?.length}
			{#each now.data.loaded_models as m}<span class="mabi-chip info" style="margin-right: 8px"
					>{m}</span
				>{/each}
		{:else}なし{/if}
	</p>
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>動いている仕事</th><th>種類</th><th>資源</th><th>状態</th></tr></thead>
			<tbody>
				{#each now.data.units ?? [] as u}
					<tr>
						<td>{u.unit}</td>
						<td>{u.kind_label}</td>
						<td>{resourceLabel(u.resource)}</td>
						<td>{u.active === 'activating' ? '実行中' : '稼働中'}（{u.sub}）</td>
					</tr>
				{:else}
					<tr><td colspan="4">動いている mabi の仕事はありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<h2>キュー</h2>
{#if queues === null}
	<p role="status">読み込んでいます</p>
{:else if !queues.ok}
	<div class="mabi-banner error" role="alert"><strong>＊読み込めません</strong>{queues.error}</div>
{:else}
	<div class="mabi-table-scroll">
		<table class="mabi-table">
			<thead><tr><th>キュー</th><th>待ち</th><th>概要（古い順に 5 件まで）</th></tr></thead>
			<tbody>
				{#each queues.data as q}
					<tr>
						<td>{q.name}</td>
						<td class="num">{q.waiting} 件</td>
						<td>
							{#each q.items as it}{it.summary || it.file}<br />{:else}—{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="support">30 秒ごとに更新します。最終更新 {fmtDateTime(Date.now())}</p>
{/if}
