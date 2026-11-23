import { describe, expect, it } from 'vitest';
import { coresLabel, lanes, type CpuView, type WeekItem } from './lanes';

// 実機の /api/week の cpu（2026-11-21 12:58 JST に取得した形）
const cpu: CpuView = {
	reserved_core: 0,
	cores: [
		{ core: 0, cpus: '0,4', role: 'OS・録画・常駐' },
		{ core: 1, cpus: '1,5', role: '予約する作業' },
		{ core: 2, cpus: '2,6', role: '予約する作業' },
		{ core: 3, cpus: '3,7', role: '予約する作業' }
	]
};

const item = (x: Partial<WeekItem>): WeekItem => ({
	start_ms: 0,
	end_ms: 1,
	kind: 'cleanup',
	kind_label: '整理',
	resource: 'cpu',
	title: 't',
	source: 'systemd',
	result: 'success',
	...x
});

const on = (ls: ReturnType<typeof lanes>, it: WeekItem) =>
	ls.filter((l) => l.match(it)).map((l) => l.key);

describe('lanes', () => {
	it('actual: one row per physical core, then the no-record row and GPU', () => {
		const ls = lanes(cpu, false);
		expect(ls.map((l) => l.key)).toEqual(['core0', 'core1', 'core2', 'core3', 'none', 'gpu']);
		expect(ls.find((l) => l.key === 'none')?.optional).toBe(true);
		expect(on(ls, item({ cores: [1] }))).toEqual(['core1']);
		expect(on(ls, item({ cores: [2, 3], gpu: true, resource: 'gpu' }))).toEqual([
			'core2',
			'core3',
			'gpu'
		]);
		expect(on(ls, item({ cores: [0] }))).toEqual(['core0']);
		// 予約を始める前の記録
		expect(on(ls, item({ resource: 'both' }))).toEqual(['none', 'gpu']);
	});

	it('planned: the fixed core, the reserved cores as one row, then GPU', () => {
		const ls = lanes(cpu, true);
		expect(ls.map((l) => l.label)).toEqual(['コア 0', 'コア 1・2・3', 'GPU']);
		expect(on(ls, item({ cores_needed: 1, gpu: true, resource: 'gpu', source: 'timer' }))).toEqual([
			'work',
			'gpu'
		]);
		expect(on(ls, item({ cores: [0], source: 'epg' }))).toEqual(['core0']);
	});

	it('falls back to the CPU and GPU rows without the reservation data', () => {
		for (const c of [null, undefined, { reserved_core: 0, cores: [] }]) {
			expect(lanes(c, false).map((l) => l.key)).toEqual(['cpu', 'gpu']);
		}
	});
});

// Mabi ADR 0118 の /api/week の cpu（優先度の段。mabi-web の試験と同じ形）
const prio: CpuView = {
	mode: 'priority',
	tiers: [
		{ key: 'rec', label: '録画・OS', weight: 1000 },
		{ key: 'interactive', label: '対話（Open WebUI・router・Claude Code）', weight: 500 },
		{ key: 'media', label: '録画の後処理', weight: 200 },
		{ key: 'ai', label: '画像生成・おすすめ録画・要約', weight: 100 },
		{ key: 'bench', label: 'ベンチ・コード実行', weight: 50 },
		{ key: 'low', label: '更新・重複整理・AIDE・CI', weight: 20 }
	],
	gpu_budget_gb: 10.85
};

describe('lanes (priority)', () => {
	it('one row per tier from high to low, the no-record row, then GPU with the budget', () => {
		for (const planned of [true, false]) {
			const ls = lanes(prio, planned);
			expect(ls.map((l) => l.key)).toEqual([
				'tier-rec',
				'tier-interactive',
				'tier-media',
				'tier-ai',
				'tier-bench',
				'tier-low',
				'none',
				'gpu'
			]);
			expect(ls.filter((l) => !l.optional).map((l) => l.key)).toEqual([
				'tier-rec',
				'tier-interactive',
				'gpu'
			]);
			expect(ls.at(-1)?.note).toContain('10.85GB');
		}
		const ls = lanes(prio, false);
		expect(on(ls, item({ tier: 'media', gpu: true, vram_gb: 5.1 }))).toEqual(['tier-media', 'gpu']);
		expect(on(ls, item({ tier: 'rec', source: 'epg' }))).toEqual(['tier-rec']);
		// 段の記録が無い（方式を変える前の実績）
		expect(on(ls, item({ cores: [1] }))).toEqual(['none']);
	});

	it('uses the core rows when mode is not priority', () => {
		expect(lanes({ ...cpu, mode: '' }, false)[0].key).toBe('core0');
	});
});

describe('coresLabel', () => {
	it('names the tier and the VRAM, or that the GPU is used alone', () => {
		const fb = (r?: string) => `(${r})`;
		expect(coresLabel(item({ tier: 'low' }), fb, prio)).toBe('更新・重複整理・AIDE・CI');
		expect(coresLabel(item({ tier: 'media', gpu: true, vram_gb: 5.1 }), fb, prio)).toBe(
			'録画の後処理、GPU 5.1GB'
		);
		expect(coresLabel(item({ tier: 'bench', gpu: true, vram_gb: null }), fb, prio)).toBe(
			'ベンチ・コード実行、GPU（占有）'
		);
		expect(coresLabel(item({ tier: 'x' }), fb, null)).toBe('x');
	});

	const fb = (r?: string) => `(${r})`;
	it('names the cores used, the number needed, or the resource', () => {
		expect(coresLabel(item({ cores: [1, 2] }), fb)).toBe('コア 1・2');
		expect(coresLabel(item({ cores: [3], gpu: true }), fb)).toBe('コア 3 と GPU');
		expect(coresLabel(item({ cores_needed: 2, resource: 'gpu' }), fb)).toBe('2 コア と GPU');
		expect(coresLabel(item({ resource: 'cpu' }), fb)).toBe('(cpu)');
	});
});
