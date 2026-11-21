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

describe('coresLabel', () => {
	const fb = (r?: string) => `(${r})`;
	it('names the cores used, the number needed, or the resource', () => {
		expect(coresLabel(item({ cores: [1, 2] }), fb)).toBe('コア 1・2');
		expect(coresLabel(item({ cores: [3], gpu: true }), fb)).toBe('コア 3 と GPU');
		expect(coresLabel(item({ cores_needed: 2, resource: 'gpu' }), fb)).toBe('2 コア と GPU');
		expect(coresLabel(item({ resource: 'cpu' }), fb)).toBe('(cpu)');
	});
});
