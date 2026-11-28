"""mabi: 連載の台帳（Mabi の mabi-tools /story）の話を、モデルを使わずに Open WebUI の note へ写す（Mabi ADR 0125）。

2026-11-28: 写す作業を自動実行（m1）に任せたところ、台帳を見る道具を 1 つ呼んで止まり、第 2 話が写らなかった。
写すのに判断は要らないので、ここで決まったとおりに写す。

10 分ごとに、各連載の「まだ写していない最も古い話」（to_copy）を見て、挿絵ができていれば（または挿絵が無い・失敗なら）
管理者の note として作り、mabi-tools に写した印を送る。挿絵を待っている間は写さない（最長 6 時間。過ぎたら挿絵なしで写す）。
"""

import asyncio
import logging
import time

from open_webui.utils import mabi_autoload as ma

log = logging.getLogger(__name__)

INTERVAL_SECONDS = 600
# このプロセスで写した話（写した印が台帳に反映されるまでの二重の写しを防ぐ）
_COPIED: set[tuple[str, int]] = set()
# 挿絵を待つ上限（台帳の話ができてから）
ILLUSTRATION_WAIT_SECONDS = 6 * 3600


def note_body(markdown: str, illustration: str | None) -> str:
    """本文の 1 行目（見出し）の次に挿絵を入れる"""
    md = (markdown or '').strip()
    if not illustration:
        return md
    lines = md.split('\n', 1)
    head = lines[0]
    rest = lines[1].lstrip('\n') if len(lines) > 1 else ''
    return f'{head}\n\n{illustration}\n\n{rest}'.rstrip() + '\n'


def created_unix(created_at: str) -> int | None:
    """台帳の作成時刻（日本時間 YYYYMMDD-HHMMSS）を UNIX 秒に"""
    try:
        import datetime

        t = datetime.datetime.strptime(created_at[:15], '%Y%m%d-%H%M%S')
        return int(t.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=9))).timestamp())
    except Exception:
        return None


def decide(tc: dict | None, now: int) -> str:
    """copy・wait・none"""
    if not tc:
        return 'none'
    status = tc.get('illustration_status')
    if status == 'queued':
        made = created_unix(str(tc.get('created_at') or ''))
        if made is None or now - made < ILLUSTRATION_WAIT_SECONDS:
            return 'wait'
    return 'copy'


async def copy_once() -> list[str]:
    """1 回分。写した話の説明を返す"""
    done = []
    listing = await ma._tools('GET', '/story')
    for series in (listing or {}).get('series') or []:
        st = await ma._tools('GET', f'/story/{series}')
        tc = (st or {}).get('to_copy')
        if decide(tc, int(time.time())) != 'copy' or (series, tc.get('n')) in _COPIED:
            continue
        from open_webui.models.notes import NoteForm, Notes
        from open_webui.models.users import Users

        owner = await Users.get_super_admin_user()
        if owner is None:
            log.warning('mabi: note を作る管理者がいない')
            return done
        n = tc.get('n')
        title = f'第{n}話：{tc.get("title")}'
        body = note_body(tc.get('markdown') or '', tc.get('illustration_markdown'))
        note = await Notes.insert_new_note(
            owner.id, NoteForm(title=title, data={'content': {'md': body}}, access_grants=[])
        )
        if not note:
            log.warning('mabi: %s の note を作れない', title)
            continue
        _COPIED.add((series, n))
        r = await ma._tools_json('POST', f'/story/{series}/copied', {'n': n, 'note_id': note.id})
        if not r:
            log.warning('mabi: %s の写した印を送れない（note %s）', title, note.id)
        done.append(f'{series} {title}（note {note.id}）')
        log.info('mabi: %s を note に写した（%s）', title, note.id)
    return done


async def story_copy_loop() -> None:
    await asyncio.sleep(60)
    while True:
        try:
            if ma.tools_connection() is not None:
                await copy_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception('mabi: 台帳の話を note に写せない')
        await asyncio.sleep(INTERVAL_SECONDS)
