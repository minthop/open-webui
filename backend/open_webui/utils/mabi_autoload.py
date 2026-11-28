"""mabi: チャットの前に、そのモデルを llama-server の router に載せる（Mabi ADR 0116）。

router は自動で読み込まない（--no-models-autoload。Mabi ADR 0011）。載っていないモデルにチャットを送ると
「model is not loaded」で止まるため、mabi-tools の POST /models/ensure に載せてもらう。mabi-tools は VRAM の計画に
従い、録画の後処理の依頼が残っていれば入れ替えない（409 と理由）。

mabi-tools の場所と鍵は、Open WebUI のツールサーバーの登録（環境変数 TOOL_SERVER_CONNECTIONS）から取る。
"""

import json
import logging
import os

import asyncio
import time

import aiohttp
from fastapi import HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from open_webui.utils import mabi_busy_text as bt

log = logging.getLogger(__name__)

# router（Mabi の compose の OPENAI_API_BASE_URL）
ROUTER_PREFIXES = ('http://127.0.0.1:8080', 'http://localhost:8080')
# モデルの読み込みは大きなモデルで 1 分ほど（Mabi ADR 0109 の実測 61 秒）。余裕を見る
TIMEOUT_SECONDS = 900


def tools_connection() -> tuple[str, str] | None:
    """TOOL_SERVER_CONNECTIONS から mabi-tools の URL と鍵を取る（無ければ None）"""
    raw = os.environ.get('TOOL_SERVER_CONNECTIONS', '')
    try:
        items = json.loads(raw) if raw else []
    except ValueError:
        return None
    for c in items if isinstance(items, list) else []:
        if not isinstance(c, dict):
            continue
        info = c.get('info') or {}
        if info.get('id') == 'mabi' and c.get('url') and c.get('key'):
            return str(c['url']).rstrip('/'), str(c['key'])
    return None


def is_router(url: str) -> bool:
    return url.rstrip('/').startswith(ROUTER_PREFIXES)


async def ensure_loaded(url: str, model: str) -> None:
    """router 宛てのチャットなら、モデルを載せてもらう。後処理中などで載せられないときは理由を利用者に返す。

    mabi-tools に届かないときは、これまでどおり router に送る（router の応答がそのまま出る）。
    """
    if not model or not is_router(url):
        return
    conn = tools_connection()
    if conn is None:
        return
    base, key = conn
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
            async with session.post(
                f'{base}/models/ensure',
                json={'model': model},
                headers={'Authorization': f'Bearer {key}'},
            ) as r:
                body = await r.json(content_type=None)
                if r.status == 200:
                    if (body or {}).get('action') == 'loaded':
                        log.info('mabi: %s を載せた（%s）', model, (body or {}).get('loaded'))
                    return
                reason = (body or {}).get('error') or f'HTTP {r.status}'
                if r.status in (400, 409):
                    raise HTTPException(status_code=r.status, detail=f'モデル {model} を載せられない: {reason}')
                log.warning('mabi: %s を載せられない（%s）。そのまま router に送る', model, reason)
    except HTTPException:
        raise
    except Exception as e:  # mabi-tools に届かない・応答が壊れている
        log.warning('mabi: mabi-tools に届かない（%s）。そのまま router に送る', e)


# ---- チャットの前の「待ち」（Mabi ADR 0124）----

# M0（LFM3、CPU に常駐。GPU を使わない）
M0_URL = 'http://127.0.0.1:8081/v1/chat/completions'
# 自動実行・「待つ」の待ちの上限（秒）と、確かめる間隔
WAIT_MAX_SECONDS = 3600
WAIT_STEP_SECONDS = 15
# 自動実行（Open WebUI の automations.py が作る内部の要求の path）
AUTOMATION_PATH = '/api/v1/automations/internal'


async def _tools(method: str, path: str) -> dict | None:
    conn = tools_connection()
    if conn is None:
        return None
    base, key = conn
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
            async with session.request(method, f'{base}{path}', headers={'Authorization': f'Bearer {key}'}) as r:
                if r.status != 200:
                    return None
                return await r.json(content_type=None)
    except Exception as e:
        log.warning('mabi: mabi-tools %s に届かない（%s）', path, e)
        return None


async def _tools_json(method: str, path: str, body: dict) -> dict | None:
    conn = tools_connection()
    if conn is None:
        return None
    base, key = conn
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
            async with session.request(
                method, f'{base}{path}', json=body, headers={'Authorization': f'Bearer {key}'}
            ) as r:
                if r.status != 200:
                    return None
                return await r.json(content_type=None)
    except Exception as e:
        log.warning('mabi: mabi-tools %s に届かない（%s）', path, e)
        return None


async def _emitter(metadata):
    if not metadata or not metadata.get('chat_id'):
        return None
    try:
        from open_webui.socket.main import get_event_emitter

        return await get_event_emitter(metadata)
    except Exception:
        return None


async def _status(emit, text: str, done: bool) -> None:
    if emit is None:
        return
    try:
        await emit({'type': 'status', 'data': {'description': text, 'done': done}})
    except Exception:
        pass


async def wait_free(metadata) -> None:
    """GPU を使う作業が終わるまで待つ（上限 WAIT_MAX_SECONDS）。待っている間は経過を状態に出す"""
    emit = await _emitter(metadata)
    t0 = time.monotonic()
    while True:
        busy = await _tools('GET', '/busy')
        if not busy or not busy.get('busy'):
            await _status(emit, '空いたので答えます', True)
            return
        waited = int(time.monotonic() - t0)
        if waited >= WAIT_MAX_SECONDS:
            await _status(emit, f'{WAIT_MAX_SECONDS // 60} 分待っても空かなかったので、このまま送ります', True)
            return
        await _status(emit, bt.waiting_status(busy, waited // 60), False)
        await asyncio.sleep(WAIT_STEP_SECONDS)


def reply(payload: dict, text: str):
    """モデルを呼ばずに返す答え（OpenAI の形。stream なら SSE）"""
    model = payload.get('model', '')
    now = int(time.time())
    if payload.get('stream'):

        def chunk(delta: dict, finish):
            return 'data: ' + json.dumps(
                {
                    'id': 'mabi-busy',
                    'object': 'chat.completion.chunk',
                    'created': now,
                    'model': model,
                    'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}],
                },
                ensure_ascii=False,
            ) + '\n\n'

        async def gen():
            yield chunk({'role': 'assistant', 'content': text}, None)
            yield chunk({}, 'stop')
            yield 'data: [DONE]\n\n'

        return StreamingResponse(gen(), media_type='text/event-stream')
    return JSONResponse(
        {
            'id': 'mabi-busy',
            'object': 'chat.completion',
            'created': now,
            'model': model,
            'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': text}, 'finish_reason': 'stop'}],
        }
    )


async def quick_answer(messages: list) -> str:
    """M0（CPU）で短く答える。道具は使わない"""
    q = bt.last_question(messages)[:3000]
    body = {
        'messages': [
            {'role': 'system', 'content': '日本語で、短く（300 字以内）答えてください。分からないことは分からないと答えます。'},
            {'role': 'user', 'content': q},
        ],
        'temperature': 0.3,
        'max_tokens': 600,
        'chat_template_kwargs': {'enable_thinking': False},
    }
    try:
        timeout = aiohttp.ClientTimeout(total=180)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
            async with session.post(M0_URL, json=body) as r:
                v = await r.json(content_type=None)
        text = ((v.get('choices') or [{}])[0].get('message') or {}).get('content') or ''
    except Exception as e:
        return f'（M0 で答えられませんでした: {e}）'
    return '（CPU の小さなモデル M0 で短く答えました。道具は使っていません）\n\n' + text.strip()


async def gate(request, url: str, payload: dict, metadata) -> object | None:
    """チャットの前に、GPU を使う作業が無いかを見る。使っていれば、人には待ちの知らせと選択肢を返し、自動実行は黙って待つ。
    選択肢への答えなら、それに従う（payload の messages は元の会話に戻す）。None なら、そのまま送ってよい"""
    if not payload.get('model') or not is_router(url) or tools_connection() is None:
        return None
    # 題・タグ・続きの質問などの裏の作業（metadata の task）は止めない（知らせが題になってしまう）
    if isinstance(metadata, dict) and metadata.get('task'):
        return None
    messages = payload.get('messages') or []
    # 道具の結果のあとの続き（同じ発言の 2 回目以降）は止めない
    if not messages or messages[-1].get('role') != 'user':
        return None
    try:
        automation = request.url.path == AUTOMATION_PATH
    except Exception:
        automation = False
    if automation:
        busy = await _tools('GET', '/busy')
        if busy and busy.get('busy'):
            log.info('mabi: 自動実行は作業が終わるまで待つ（%s）', [u.get('unit') for u in busy.get('users') or []])
            await wait_free(None)
        return None
    choice, original = bt.parse_choice(messages)
    if choice is None:
        busy = await _tools('GET', '/busy')
        if busy and busy.get('busy'):
            return reply(payload, bt.notice(busy))
        return None
    payload['messages'] = original
    if choice == bt.STOP:
        return reply(payload, 'やめました。空いてから、もう一度送ってください。')
    if choice == bt.QUICK:
        return reply(payload, await quick_answer(original))
    if choice == bt.YIELD:
        await _tools('POST', '/busy/yield')
    await wait_free(metadata)
    return None
