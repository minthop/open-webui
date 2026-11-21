// mabi: 1 週間の画面の行（物理コアごと・GPU）。Mabi ADR 0090 の CPU の予約に合わせる（Mabi ADR 0094）。
// データは mabi-web の /api/week: `cpu`（物理コアと役割）、各件の `cores`（実績: 予約したコア。常駐・録画・軽い定期処理は
// 予約しないコア）・`cores_needed`（予定: 要るコアの数。どのコアかは始まるときに決まる）・`gpu`

export type WeekItem = {
	start_ms: number;
	end_ms: number | null;
	kind: string;
	kind_label: string;
	resource: string;
	title: string;
	source: string;
	result: string | null;
	cores?: number[];
	cores_needed?: number;
	gpu?: boolean;
};

export type CpuCore = { core: number; cpus: string; role: string };
export type CpuView = { reserved_core: number; cores: CpuCore[] };

export type Lane = {
	key: string;
	label: string;
	note: string;
	/** その日に該当がなければ描かない行 */
	optional: boolean;
	match: (it: WeekItem) => boolean;
};

const usesGpu = (it: WeekItem) =>
	it.gpu === true || it.resource === 'gpu' || it.resource === 'both';

const noCoreInfo = (it: WeekItem) => it.cores === undefined && it.cores_needed === undefined;

/** CPU の予約の情報が無い（古い mabi-web）ときの行: 今までどおり CPU と GPU の 2 行 */
const legacyLanes = (): Lane[] => [
	{
		key: 'cpu',
		label: 'CPU',
		note: '',
		optional: false,
		match: (it) => it.resource === 'cpu' || it.resource === 'both'
	},
	{ key: 'gpu', label: 'GPU', note: '', optional: false, match: usesGpu }
];

/**
 * 行の並び。実績は物理コアごと（予約したコアに描く）。予定は予約しないコアと、予約するコアをまとめた 1 行
 * （どのコアになるかは始まるときに決まるため）。最後に GPU
 */
export function lanes(cpu: CpuView | null | undefined, planned: boolean): Lane[] {
	if (!cpu || !Array.isArray(cpu.cores) || cpu.cores.length === 0) return legacyLanes();
	const r = cpu.reserved_core;
	const out: Lane[] = [];
	const fixed = cpu.cores.find((c) => c.core === r);
	if (fixed) {
		out.push({
			key: `core${r}`,
			label: `コア ${r}`,
			note: `${fixed.role}（論理 CPU ${fixed.cpus}）`,
			optional: false,
			match: (it) => (it.cores ?? []).includes(r)
		});
	}
	const work = cpu.cores.filter((c) => c.core !== r);
	if (planned) {
		out.push({
			key: 'work',
			label: `コア ${work.map((c) => c.core).join('・')}`,
			note: '予約する作業（どのコアかは始まるときに決まる。内訳に要るコアの数）',
			optional: false,
			match: (it) => it.cores_needed !== undefined
		});
	} else {
		for (const c of work) {
			out.push({
				key: `core${c.core}`,
				label: `コア ${c.core}`,
				note: `${c.role}（論理 CPU ${c.cpus}）`,
				optional: false,
				match: (it) => (it.cores ?? []).includes(c.core)
			});
		}
		out.push({
			key: 'none',
			label: 'コアの記録なし',
			note: '予約を始める前に動いたもの（コアを固定していない）',
			optional: true,
			match: noCoreInfo
		});
	}
	out.push({ key: 'gpu', label: 'GPU', note: '', optional: false, match: usesGpu });
	return out;
}

/** 内訳の「資源」: 実績は使ったコア、予定は要るコアの数。どちらも無ければ CPU・GPU の別 */
export function coresLabel(it: WeekItem, fallback: (r?: string) => string): string {
	const gpu = usesGpu(it) ? ' と GPU' : '';
	if (it.cores && it.cores.length) return `コア ${it.cores.join('・')}${gpu}`;
	if (it.cores_needed !== undefined) return `${it.cores_needed} コア${gpu}`;
	return fallback(it.resource);
}
