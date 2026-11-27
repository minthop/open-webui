"""mabi: チャットの前の「待ち」の文と、選んだ答えの読み取り（Mabi ADR 0124）。

重い依存を持たない（単体で試せるように）。送受信は mabi_autoload.py。
"""

# 待ちの知らせの印（次の発言が選択肢の答えかを、この印で見分ける）
MARK = '【mabi: 待ち】'

WAIT, STOP, QUICK, YIELD = 'wait', 'stop', 'quick', 'yield'

_WORDS = [
    (WAIT, ('1', '１', '待つ', 'まつ')),
    (STOP, ('2', '２', 'やめる', 'キャンセル')),
    (QUICK, ('3', '３', '軽いモデル', '軽い', '今すぐ')),
    (YIELD, ('4', '４', '作業を止め', '止めて')),
]


def _text(m: dict) -> str:
    c = m.get('content')
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return ''.join(p.get('text', '') for p in c if isinstance(p, dict))
    return ''


def classify(answer: str) -> str | None:
    """選択肢の答え（番号か言葉）。読めなければ None"""
    a = answer.strip().strip('。.「」 ')
    if not a or len(a) > 20:
        return None
    for key, words in _WORDS:
        for w in words:
            if a == w or (len(w) > 1 and a.startswith(w)):
                return key
    return None


def parse_choice(messages: list) -> tuple[str | None, list]:
    """最後の発言が、直前の待ちの知らせへの答えか。（答え、元の会話＝知らせと答えを除いたもの）。答えでなければ（None, messages）"""
    if len(messages) < 3:
        return None, messages
    last, prev = messages[-1], messages[-2]
    if last.get('role') != 'user' or prev.get('role') != 'assistant' or MARK not in _text(prev):
        return None, messages
    choice = classify(_text(last))
    if choice is None:
        return None, messages
    return choice, messages[:-2]


def notice(busy: dict) -> str:
    """待ちの知らせ（何が使っているか・いつから・選択肢）"""
    lines = [f'{MARK} いまサーバーの次の作業がモデル（GPU）を使っています。']
    for u in busy.get('users') or []:
        since = str(u.get('since_jst') or '')
        hm = f'{since[9:11]}:{since[11:13]}' if len(since) >= 13 else '?'
        lines.append(
            f'- {u.get("label")}（{u.get("unit")}）: {hm} から（経過 {u.get("elapsed_min")} 分）。終わる目安は不明'
        )
    lines += [
        '',
        '次から選んで、番号か言葉で送ってください。',
        '1. 待つ — 空いたら自動で答えます（待っている間は経過を表示します）',
        '2. やめる — 何もしません',
        '3. 軽いモデルで今すぐ — CPU の小さなモデル（M0）で短く答えます（道具は使えません）',
    ]
    if busy.get('stoppable'):
        lines.append('4. 作業を止めてすぐ答える — ベンチ・物語の流れ・画像生成を次の区切りで止めます（録画の後処理は止めません）')
    else:
        lines.append('4. 作業を止めてすぐ答える — いま止められる作業はありません（録画の後処理は止めません）。選ぶと「待つ」と同じです')
    return '\n'.join(lines)


def waiting_status(busy: dict, waited_min: int) -> str:
    names = '・'.join(str(u.get('label')) for u in busy.get('users') or []) or '作業'
    return f'{names}が終わるのを待っています（{waited_min} 分経過）'


def last_question(messages: list) -> str:
    for m in reversed(messages):
        if m.get('role') == 'user':
            return _text(m)
    return ''
