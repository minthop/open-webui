"""mabi: チャットの前に、そのモデルを llama-server の router に載せる（Mabi ADR 0116）。

router は自動で読み込まない（--no-models-autoload。Mabi ADR 0011）。載っていないモデルにチャットを送ると
「model is not loaded」で止まるため、mabi-tools の POST /models/ensure に載せてもらう。mabi-tools は VRAM の計画に
従い、録画の後処理の依頼が残っていれば入れ替えない（409 と理由）。

mabi-tools の場所と鍵は、Open WebUI のツールサーバーの登録（環境変数 TOOL_SERVER_CONNECTIONS）から取る。
"""

import json
import logging
import os

import aiohttp
from fastapi import HTTPException

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
