"""mabi: サーバーの画面の「ワークフロー」タブの今の状態（Mabi ADR 0129）。

mabi-tools（鍵が要る）の `GET /busy`・`GET /story`・`GET /story/{series}` を、ログインした利用者にだけ読ませる。
本文（markdown）は返さない（画面は状態だけを出す）。書き込みはしない。
"""

import asyncio

from fastapi import APIRouter, Depends
from open_webui.utils import mabi_autoload as ma
from open_webui.utils.auth import get_verified_user

router = APIRouter()


def summarize_series(st: dict) -> dict:
    """連載の状態から、画面に出すものだけを取り出す"""
    eps = st.get('episodes') or []
    tc = st.get('to_copy') or None
    return {
        'series': st.get('series'),
        'premise': st.get('premise'),
        'episodes': len(eps),
        'latest': (
            {k: eps[-1].get(k) for k in ('n', 'title', 'created_at', 'note_id', 'illustration_status')}
            if eps
            else None
        ),
        'to_copy': (
            {k: tc.get(k) for k in ('n', 'title', 'created_at', 'illustration_status')} if tc else None
        ),
        'open_items': st.get('open_items', 0),
        'today_episode': bool(st.get('today_episode')),
    }


@router.get('/workflow')
async def workflow(user=Depends(get_verified_user)):
    if ma.tools_connection() is None:
        return {'ok': False, 'error': 'mabi-tools に接続していない'}
    busy, listing = await asyncio.gather(ma._tools('GET', '/busy'), ma._tools('GET', '/story'))
    names = [s for s in (listing or {}).get('series') or [] if isinstance(s, str)][:20]
    states = await asyncio.gather(*[ma._tools('GET', f'/story/{s}') for s in names])
    return {
        'ok': True,
        'busy': busy,
        'series': [summarize_series(st) for st in states if st],
        'story_error': listing is None,
    }
