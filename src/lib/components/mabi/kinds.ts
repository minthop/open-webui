// mabi: 仕事の種類の色（DADS のグラフの系列色 chart-1〜6 と chart-muted）。色だけで伝えないよう、凡例と表に文字も出す
export const KIND_COLORS: Record<string, string> = {
	recording: '#0017c1', // chart-1 blue-900
	encode: '#e25100', // chart-2 orange-700
	ai: '#006f83', // chart-3 cyan-900
	update: '#a58000', // chart-4 yellow-800
	bench: '#6f23d0', // chart-5 purple-700
	cleanup: '#197a4b', // chart-6 green-800
	watch: '#949494', // chart-muted
	service: '#949494'
};

export const KIND_LABELS: Record<string, string> = {
	recording: '録画',
	encode: '変換',
	ai: 'AI',
	update: '更新',
	bench: 'ベンチマーク',
	cleanup: '整理',
	watch: '監視',
	service: '常駐'
};
