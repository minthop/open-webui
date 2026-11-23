// mabi: 1 週間の画面の行。Mabi ADR 0118 の CPU の優先度では優先度の段ごと・GPU（`cpu.mode = "priority"`）。
// 前の版（Mabi ADR 0090 の物理コアの予約。ADR 0094）の mabi-web なら物理コアごと・GPU。
// データは mabi-web の /api/week: `cpu`（段の一覧・GPU の予算、前の版は物理コアと役割）、各件の `tier`（段）・`vram_gb`（予約した
// VRAM。無ければ占有）・`gpu`、前の版は `cores`・`cores_needed`

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
	tier?: string | null;
	vram_gb?: number | null;
};

export type CpuCore = { core: number; cpus: string; role: string };
export type CpuTier = { key: string; label: string; weight: number };
export type CpuView = {
	mode?: string;
	reserved_core?: number;
	cores?: CpuCore[];
	tiers?: CpuTier[];
	gpu_budget_gb?: number | null;
};

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
/** 優先度の段ごとの行（高い順）と GPU。段の無い件は「段の記録なし」（任意の行） */
function tierLanes(cpu: CpuView): Lane[] {
	const tiers = cpu.tiers ?? [];
	const keys = new Set(tiers.map((t) => t.key));
	const out: Lane[] = tiers.map((t) => ({
		key: `tier-${t.key}`,
		label: t.label,
		note: `優先度の重み ${t.weight}`,
		// 録画・OS と対話は常にある。作業の段はその日に動いたときだけ描く
		optional: !(t.key === 'rec' || t.key === 'interactive'),
		match: (it: WeekItem) => it.tier === t.key
	}));
	out.push({
		key: 'none',
		label: '段の記録なし',
		note: '優先度の方式の前に動いたもの',
		optional: true,
		match: (it) => !it.tier || !keys.has(it.tier)
	});
	const budget = cpu.gpu_budget_gb;
	out.push({
		key: 'gpu',
		label: 'GPU',
		note:
			typeof budget === 'number'
				? `VRAM の予算 ${budget.toFixed(2)}GB（合計が収まる間は同時に動く）`
				: '',
		optional: false,
		match: usesGpu
	});
	return out;
}

export function lanes(cpu: CpuView | null | undefined, planned: boolean): Lane[] {
	if (cpu && cpu.mode === 'priority' && Array.isArray(cpu.tiers) && cpu.tiers.length > 0)
		return tierLanes(cpu);
	if (!cpu || !Array.isArray(cpu.cores) || cpu.cores.length === 0) return legacyLanes();
	const r = cpu.reserved_core ?? 0;
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

/** 内訳の「資源」: 優先度の段と GPU の VRAM。前の版は使ったコア・要るコアの数。どれも無ければ CPU・GPU の別 */
export function coresLabel(
	it: WeekItem,
	fallback: (r?: string) => string,
	cpu?: CpuView | null
): string {
	if (it.tier) {
		const t = cpu?.tiers?.find((x) => x.key === it.tier);
		const name = t ? t.label : it.tier;
		if (!usesGpu(it)) return name;
		return typeof it.vram_gb === 'number'
			? `${name}、GPU ${it.vram_gb.toFixed(1)}GB`
			: `${name}、GPU（占有）`;
	}
	const gpu = usesGpu(it) ? ' と GPU' : '';
	if (it.cores && it.cores.length) return `コア ${it.cores.join('・')}${gpu}`;
	if (it.cores_needed !== undefined) return `${it.cores_needed} コア${gpu}`;
	return fallback(it.resource);
}
