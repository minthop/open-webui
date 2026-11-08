// mabi: mabi-web（読み取り専用の JSON）と EPGStation への入口（ADR 0035）。
// mabi-web は同じ origin の /mabi-api/ に Caddy が中継する（W4）。操作は mabi-tools（/mabi-tools/）。

export const MABI_API = '/mabi-api';

/** EPGStation の画面（同じホストの 8888 番。v2.10.0 の vue-router は hash の形） */
export const epgUrl = (path: string): string =>
	`${location.protocol}//${location.hostname}:8888/#${path}`;

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getJson<T = any>(path: string): Promise<Loaded<T>> {
	try {
		const res = await fetch(`${MABI_API}${path}`, { headers: { Accept: 'application/json' } });
		if (!res.ok) {
			return { ok: false, error: `${res.status} ${res.statusText}` };
		}
		return { ok: true, data: (await res.json()) as T };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

const jst = new Intl.DateTimeFormat('ja-JP', {
	timeZone: 'Asia/Tokyo',
	month: 'numeric',
	day: 'numeric',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit'
});
const jstHm = new Intl.DateTimeFormat('ja-JP', {
	timeZone: 'Asia/Tokyo',
	hour: '2-digit',
	minute: '2-digit'
});
const jstDay = new Intl.DateTimeFormat('ja-JP', {
	timeZone: 'Asia/Tokyo',
	month: 'numeric',
	day: 'numeric',
	weekday: 'short'
});

/** ミリ秒 → 「11/8(日) 20:30」（日本時間） */
export const fmtDateTime = (ms?: number | null): string => (ms ? jst.format(new Date(ms)) : '—');
export const fmtHm = (ms?: number | null): string => (ms ? jstHm.format(new Date(ms)) : '—');
export const fmtDay = (ms: number): string => jstDay.format(new Date(ms));

/** 日本時間の日の始まり（ミリ秒） */
export const jstDayStart = (ms: number): number => {
	const off = 9 * 3600_000;
	return Math.floor((ms + off) / 86_400_000) * 86_400_000 - off;
};

export const fmtSeconds = (s: number): string =>
	s >= 3600 ? `${Math.round(s / 360) / 10}時間` : s >= 60 ? `${Math.round(s / 60)}分` : `${s}秒`;

/** 結果の日本語（色だけで伝えないため、文字でも出す） */
export const resultLabel = (r?: string | null): string =>
	({
		success: '成功',
		failed: '失敗',
		stopped: '停止',
		running: '実行中',
		unknown: '不明'
	})[r ?? ''] ??
	(r || '—');

export const resourceLabel = (r?: string): string =>
	({ cpu: 'CPU', gpu: 'GPU', both: 'CPU と GPU' })[r ?? ''] ?? '—';
