<script lang="ts">
	// mabi: ワークフロー（Mabi ADR 0129・0131）。「連載の続き」と「録画」の流れを切り替えて見る。
	// 段は mabi の recipes/story-next.json・ADR 0123・0127（連載）と crates/mabi/src/media/pipeline.rs の STEPS（録画）に
	// 合わせる（変えたらここも直す）。担うモデルは mabi-web の台帳（/api/models）から、連載の今の状態は
	// Open WebUI の /api/v1/mabi/workflow（mabi-tools の中継）から、録画は mabi-web の /api/queues・/api/now から
	import { onMount, onDestroy, tick } from 'svelte';
	import { WEBUI_API_BASE_URL } from '$lib/constants';
	import { getJson, type Loaded } from '$lib/mabi/api';

	let models: Loaded<any> | null = null;
	let wf: Loaded<any> | null = null;
	let queues: Loaded<any[]> | null = null;
	let now: Loaded<any> | null = null;
	let loadedAt: Date | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	const EVERY_MS = 30_000;

	const FLOWS = [
		{ id: 'story', label: '連載の続き' },
		{ id: 'rec', label: '録画' }
	];
	const KEY = 'mabi.workflow.flow';
	let flow = FLOWS[0].id;

	const loadWf = async () => {
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
	};
	const loadRec = async () => {
		[queues, now] = await Promise.all([getJson<any[]>('/api/queues'), getJson('/api/now')]);
	};
	const load = async () => {
		if (document.hidden) return;
		await (flow === 'story' ? loadWf() : loadRec());
		loadedAt = new Date();
	};

	onMount(async () => {
		const saved = localStorage.getItem(KEY);
		if (saved && FLOWS.some((f) => f.id === saved)) flow = saved;
		load();
		timer = setInterval(load, EVERY_MS);
		models = await getJson('/api/models');
	});
	onDestroy(() => timer && clearInterval(timer));

	const select = async (id: string, focus = false) => {
		flow = id;
		localStorage.setItem(KEY, id);
		load();
		if (focus) {
			await tick();
			document.getElementById(`mabi-flow-${id}`)?.focus();
		}
	};
	// 矢印キー・Home・End でタブを移る（WAI-ARIA の tabs）
	const onKey = (e: KeyboardEvent) => {
		const i = FLOWS.findIndex((f) => f.id === flow);
		const next =
			e.key === 'ArrowRight'
				? (i + 1) % FLOWS.length
				: e.key === 'ArrowLeft'
					? (i - 1 + FLOWS.length) % FLOWS.length
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? FLOWS.length - 1
							: -1;
		if (next >= 0) {
			e.preventDefault();
			select(FLOWS[next].id, true);
		}
	};

	/** 役割を担う今のモデル（台帳から。読めなければ空） */
	$: modelOf = (role: string): string => {
		if (!models?.ok) return '';
		const r = (models.data?.roles ?? []).find((x: any) => x.role === role);
		return r?.current?.id ?? '';
	};

	type Step = { role: string; what: string; detail: string };
	/** 物語の続き（story-next）の段。M0 は各段の出力を見張り、M5 は立て直す */
	const STORY_STEPS: Step[] = [
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
	/** 録画の後処理の段（pipeline.rs の STEPS の順） */
	const REC_STEPS: Step[] = [
		{ role: '', what: '検証', detail: '録画が壊れていないか（失敗したら原本を残して止まる）' },
		{ role: '', what: '解析', detail: '無音・局ロゴ・CM の候補' },
		{
			role: '',
			what: 'エンコード',
			detail: 'NVENC の H.265（原寸）。CM の候補があれば CM カット版も作る'
		},
		{
			role: 'M9',
			what: '文字起こし',
			detail: '放送の字幕が十分なら字幕を使い、無ければ whisper.cpp で音声を 1 回で'
		},
		{ role: '', what: 'シーン画像', detail: '均等に最大 60 枚' },
		{ role: 'M4', what: '場面のメモ', detail: '画像を読み、焼き込みの字幕や場面を書き留める' },
		{
			role: 'M4',
			what: '要約',
			detail: '字幕・文字起こし・場面のメモを時間順に並べ、番組表の情報を添えて要約'
		},
		{ role: '', what: '山場', detail: 'EPGStation のサムネイルを山場の画像に差し替える' },
		{
			role: 'M10',
			what: '検索の索引',
			detail: 'VideoRAG の埋め込み（TEI・CPU）。検索では M11 が並べ替える'
		},
		{ role: '', what: '整理', detail: '番組ごとのメタデータ（JSON）を書く' }
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
	/** note の id（英数字と -）なら Open WebUI の note のページ */
	const noteHref = (id?: string | null): string | null =>
		id && /^[A-Za-z0-9-]{1,64}$/.test(id) ? `/notes/${id}` : null;
	$: mediaQueue = queues?.ok ? queues.data.find((q: any) => q.name === '録画の後処理') : null;
</script>

<div class="mabi-tabs" role="tablist" aria-label="ワークフローの種類">
	{#each FLOWS as f}
		<button
			id="mabi-flow-{f.id}"
			role="tab"
			type="button"
			aria-selected={flow === f.id}
			aria-controls="mabi-flow-panel"
			tabindex={flow === f.id ? 0 : -1}
			on:click={() => select(f.id)}
			on:keydown={onKey}>{f.label}</button
		>
	{/each}
</div>

<div id="mabi-flow-panel" role="tabpanel" aria-labelledby="mabi-flow-{flow}">
	{#if flow === 'story'}
		<h2>連載の続きの流れ</h2>
		<p class="support">
			毎朝 9:00 にサーバーが連載ごとに続きの依頼を置き、GPU
			が空いたら役割の順に動かします。各段の出力は M0
			が見張り、途中で終わった・繰り返した・報告文になったときは書き直させます。決めた回数やり直しても通らなければ
			M5 が立て直します。
		</p>
		<ol class="mabi-flow">
			<li>
				<div class="head">9:00 に依頼を置く</div>
				<div class="who">mabi-story.timer（毎朝 9:00、日本時間）</div>
				台帳のある連載ごとに、今日の話がまだ無ければ「物語の続き」の依頼を待ち行列に置きます。連載が複数あれば順に書きます。第
				1 話を始めるのは人間です（チャットで「mabi_run」）。
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
					{#each STORY_STEPS as s}
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

		<h2>連載の今の状態</h2>
		<p class="support">
			30 秒ごとに更新{#if loadedAt}。最終: {loadedAt.toLocaleTimeString(
					'ja-JP'
				)}{/if}。話の題を選ぶと note を開きます
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
						<thead
							><tr><th>使っている作業</th><th>段</th><th>始めた時刻</th><th>経過</th></tr></thead
						>
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

			{#if wf.data.story_error}
				<div class="mabi-banner error" role="alert">
					<strong>＊台帳の一覧を読み込めません</strong>
				</div>
			{:else if !wf.data.series.length}
				<p>連載はまだありません（チャットで「mabi_run」に第 1 話を頼むと始まります）</p>
			{:else}
				{#each wf.data.series as s}
					<h3>{s.series}</h3>
					<p class="support">
						前提: {s.premise ?? '—'}。全 {s.episodes} 話・未回収の伏線と矛盾 {s.open_items} 件・今日の話
						{#if s.today_episode}<span class="mabi-chip ok">できた</span>{:else}<span
								class="mabi-chip muted">まだ</span
							>{/if}
					</p>
					{#if s.list?.length}
						<div class="mabi-table-scroll">
							<table class="mabi-table">
								<thead
									><tr><th>話</th><th>題（note）</th><th>できた時刻</th><th>挿絵</th></tr></thead
								>
								<tbody>
									{#each s.list as e}
										{@const href = noteHref(e.note_id)}
										<tr>
											<td class="num">第 {e.n} 話</td>
											<td>
												{#if href}<a {href}>{e.title}</a>{:else}{e.title}
													<span class="mabi-chip warn">note にまだ写していない</span>{/if}
											</td>
											<td>{stamp(e.created_at)}</td>
											<td
												><span class="mabi-chip {ill(e.illustration_status)[1]}"
													>{ill(e.illustration_status)[0]}</span
												></td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p>まだ話がありません（第 1 話を書いています）</p>
					{/if}
				{/each}
			{/if}
		{/if}
	{:else}
		<h2>録画の流れ</h2>
		<p class="support">
			録画は番組表のルールと AI のおすすめで予約し、録画が終わると後処理の依頼を置きます。後処理は
			GPU が空いたら段ごとに進み、終わった段は記録するので、止まっても続きからやり直せます。
		</p>
		<ol class="mabi-flow">
			<li>
				<div class="head">予約する</div>
				<div class="who">
					EPGStation のルール・AI のおすすめ（mabi-recommend.timer、3:40 と 15:40）
				</div>
				おすすめは M3{#if modelOf('M3')}（{modelOf('M3')}）{/if} が番組表から選んで予約します。同じ内容の番組は録画しません（重複の除外）。
			</li>
			<li>
				<div class="head">録画する</div>
				<div class="who">mirakc・recisdb（PT3）→ EPGStation</div>
				録画の間は GPU を使う作業より録画を優先します。
			</li>
			<li>
				<div class="head">後処理の依頼を置く</div>
				<div class="who">EPGStation の録画終了のフック</div>
				録画ごとに依頼（録画の番号.job）を後処理の待ち行列に置きます。
			</li>
			<li>
				<div class="head">後処理（段ごと）</div>
				<div class="who">media worker（依頼が来たとき・5 分ごと）</div>
				<ol>
					{#each REC_STEPS as s}
						<li>
							{#if s.role}<strong>{s.role}</strong>{#if modelOf(s.role)}（{modelOf(s.role)}）{/if}:
							{/if}{s.what} — <span class="support">{s.detail}</span>
						</li>
					{/each}
				</ol>
			</li>
			<li>
				<div class="head">見る・探す</div>
				<div class="who">「録画と派生物」タブ・<code>mabi media search</code></div>
				要約・文字起こし・場面のメモは「録画と派生物」タブで見られます。言葉での検索は
				<code>mabi media search</code>（M10 の索引と M11
				の並べ替え）。失敗した後処理は通知に出ます（原本は残します）。
			</li>
		</ol>

		<h2>録画の今の状態</h2>
		<p class="support">
			30 秒ごとに更新{#if loadedAt}。最終: {loadedAt.toLocaleTimeString('ja-JP')}{/if}
		</p>
		<h3>録画中</h3>
		{#if now === null}
			<p role="status">読み込んでいます</p>
		{:else if !now.ok}
			<div class="mabi-banner error" role="alert"><strong>＊読み込めません</strong>{now.error}</div>
		{:else if now.data.recording?.length}
			<ul>
				{#each now.data.recording as r}<li>{r.name}</li>{/each}
			</ul>
		{:else}
			<p>録画中の番組はありません</p>
		{/if}
		<h3>後処理の待ち</h3>
		{#if queues === null}
			<p role="status">読み込んでいます</p>
		{:else if !queues.ok}
			<div class="mabi-banner error" role="alert">
				<strong>＊読み込めません</strong>{queues.error}
			</div>
		{:else if !mediaQueue}
			<p>後処理の待ち行列を読み込めません</p>
		{:else}
			<p>{mediaQueue.waiting} 件</p>
			{#if mediaQueue.items?.length}
				<ul>
					{#each mediaQueue.items as it}<li>{it.summary || it.file}</li>{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>
