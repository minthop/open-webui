<script lang="ts">
	// mabi: ワークフロー（毎朝の連載の続き・役割の流れ・挿絵・note への写し）と今の状態（Mabi ADR 0129）。
	// 流れの段は mabi の recipes/story-next.json と ADR 0123・0127 に合わせる（変えたらここも直す）。
	// 担うモデルは mabi-web の台帳（/api/models）から、今の状態は Open WebUI の /api/v1/mabi/workflow（mabi-tools の中継）から
	import { onMount, onDestroy } from 'svelte';
	import { WEBUI_API_BASE_URL } from '$lib/constants';
	import { getJson, type Loaded } from '$lib/mabi/api';

	let models: Loaded<any> | null = null;
	let wf: Loaded<any> | null = null;
	let loadedAt: Date | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	const EVERY_MS = 30_000;

	const loadWf = async () => {
		if (document.hidden) return;
		try {
			const res = await fetch(`${WEBUI_API_BASE_URL}/mabi/workflow`, {
				headers: { Accept: 'application/json', Authorization: `Bearer ${localStorage.token}` }
			});
			const v = res.ok ? await res.json() : null;
			wf =
				v && v.ok
					? { ok: true, data: v }
					: { ok: false, error: v?.error ?? `${res.status} ${res.statusText}` };
		} catch (e) {
			wf = { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
		loadedAt = new Date();
	};

	onMount(async () => {
		loadWf();
		timer = setInterval(loadWf, EVERY_MS);
		models = await getJson('/api/models');
	});
	onDestroy(() => timer && clearInterval(timer));

	/** 役割を担う今のモデル（台帳から。読めなければ役割だけ） */
	$: modelOf = (role: string): string => {
		if (!models?.ok) return '';
		const r = (models.data?.roles ?? []).find((x: any) => x.role === role);
		return r?.current?.id ?? '';
	};

	type Step = { role: string; what: string; detail: string };
	/** 物語の続き（story-next）の段。M0 は各段の出力を見張り、M5 は立て直す */
	const STEPS: Step[] = [
		{
			role: 'M7',
			what: '流れの要約',
			detail: 'これまでの全話を読み、続きを書く作家に渡す要約を作る'
		},
		{ role: 'M3', what: '資料集め', detail: 'SearXNG で検索し、使える事実を 5 つ選ぶ' },
		{
			role: 'M10・M11',
			what: '過去の本文を引く',
			detail: '未回収の伏線・要約に近い段落を探して並べ替える'
		},
		{
			role: 'M1',
			what: '本文を書く',
			detail: '第 N 話（2,000 字以上、最大 6,000 トークン）。途中で切れたら段落の区切りで結ぶ'
		},
		{ role: 'M6', what: '校閲', detail: '設定・未回収の伏線・過去の本文と照らして矛盾を指摘する' },
		{
			role: 'M8',
			what: '台帳に書く',
			detail: '校閲の結果を、設定・伏線・矛盾の追加と回収に変える（30 話以内に回収）'
		},
		{ role: 'M2', what: '挿絵の場面', detail: '話から場面を 1 つ選び、200 字以内で書く' },
		{
			role: 'M12',
			what: '挿絵を描く',
			detail: '候補を描き、M5 が採点して 1 枚を選ぶ（文字は描かない）'
		}
	];

	const ILL: Record<string, [string, string]> = {
		done: ['挿絵あり', 'ok'],
		queued: ['挿絵を描いている', 'info'],
		failed: ['＊挿絵なし（失敗）', 'warn'],
		unknown: ['挿絵の記録なし', 'muted']
	};
	const ill = (s?: string | null): [string, string] => ILL[s ?? ''] ?? ['挿絵なし', 'muted'];
	/** `YYYYMMDD-HHMMSS` → 「11/28 11:56」 */
	const stamp = (s?: string | null): string =>
		s && s.length >= 13
			? `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))} ${s.slice(9, 11)}:${s.slice(11, 13)}`
			: '—';
</script>

<h2>毎日の流れ（連載の続き）</h2>
<p class="support">
	毎朝 9:00 にサーバーが続きの依頼を置き、GPU が空いたら役割の順に動かします。各段の出力は M0
	が見張り、途中で終わった・繰り返した・報告文になったときは書き直させます。決めた回数やり直しても通らなければ
	M5 が立て直します。
</p>

<ol class="mabi-flow">
	<li>
		<div class="head">9:00 に依頼を置く</div>
		<div class="who">mabi-story.timer（毎朝 9:00、日本時間）</div>
		台帳のある連載ごとに、今日の話がまだ無ければ「物語の続き」の依頼を待ち行列に置きます。第 1 話を始めるのは人間です（チャットで「mabi_run」）。
	</li>
	<li>
		<div class="head">GPU が空くのを待つ</div>
		<div class="who">image worker（5 分ごと・依頼が来たとき）</div>
		録画・会話・録画の後処理を先にし、ベンチより先に動きます。チャットで「作業を止めてすぐ答える」を選ぶと、次の段の区切りで譲ります。
	</li>
	<li>
		<div class="head">役割の順に書く</div>
		<div class="who">レシピ story-next</div>
		<ol>
			{#each STEPS as s}
				<li>
					<strong>{s.role}</strong>{#if modelOf(s.role.split('・')[0])}（{modelOf(
							s.role.split('・')[0]
						)}）{/if}: {s.what} — <span class="support">{s.detail}</span>
				</li>
			{/each}
		</ol>
	</li>
	<li>
		<div class="head">note に写す</div>
		<div class="who">image worker（描き終えた後）</div>
		「第 N 話：題」の note を作り、見出しの次に挿絵を入れます。挿絵を待つのは話ができてから 6 時間まで。写したら台帳に
		note の番号を書きます（二重に写しません）。
	</li>
</ol>

<h2>今の状態</h2>
<p class="support">
	30 秒ごとに更新{#if loadedAt}。最終: {loadedAt.toLocaleTimeString('ja-JP')}{/if}
</p>
{#if wf === null}
	<p role="status">読み込んでいます</p>
{:else if !wf.ok}
	<div class="mabi-banner error" role="alert">
		<strong>＊今の状態を読み込めません</strong>{wf.error}
	</div>
{:else}
	{@const b = wf.data.busy}
	<h3>GPU</h3>
	{#if !b}
		<p>GPU の予約を読み込めません</p>
	{:else if !b.busy}
		<p><span class="mabi-chip ok">空いている</span></p>
	{:else}
		<div class="mabi-table-scroll">
			<table class="mabi-table">
				<thead><tr><th>使っている作業</th><th>段</th><th>始めた時刻</th><th>経過</th></tr></thead>
				<tbody>
					{#each b.users as u}
						<tr>
							<td>{u.job}</td>
							<td>{u.label}</td>
							<td>{stamp(u.since_jst)}</td>
							<td class="num">{u.elapsed_min} 分</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<h3>連載</h3>
	{#if wf.data.story_error}
		<div class="mabi-banner error" role="alert"><strong>＊台帳の一覧を読み込めません</strong></div>
	{:else if !wf.data.series.length}
		<p>連載はまだありません（チャットで「mabi_run」に第 1 話を頼むと始まります）</p>
	{:else}
		<div class="mabi-table-scroll">
			<table class="mabi-table">
				<thead>
					<tr>
						<th>連載</th>
						<th>話数</th>
						<th>最新の話</th>
						<th>今日の話</th>
						<th>note</th>
						<th>未回収の伏線・矛盾</th>
					</tr>
				</thead>
				<tbody>
					{#each wf.data.series as s}
						{@const l = s.latest}
						<tr>
							<th scope="row">{s.series}<br /><span class="support">{s.premise ?? ''}</span></th>
							<td class="num">{s.episodes} 話</td>
							<td>
								{#if l}
									第 {l.n} 話：{l.title}<br /><span class="support">{stamp(l.created_at)}</span>
									<span class="mabi-chip {ill(l.illustration_status)[1]}"
										>{ill(l.illustration_status)[0]}</span
									>
								{:else}—{/if}
							</td>
							<td>
								{#if s.today_episode}<span class="mabi-chip ok">できた</span>{:else}<span
										class="mabi-chip muted">まだ</span
									>{/if}
							</td>
							<td>
								{#if s.to_copy}
									<span class="mabi-chip warn">第 {s.to_copy.n} 話をまだ写していない</span>
								{:else}<span class="mabi-chip ok">すべて写した</span>{/if}
							</td>
							<td class="num">{s.open_items} 件</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}
