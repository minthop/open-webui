# minthop/open-webui（mabi のためのフォーク）

これは [Open WebUI](https://github.com/open-webui/open-webui) のフォークです。**公式の Open WebUI ではなく**、Open WebUI のチームが保守しているものでもありません。自宅のサーバー mabi（[minthop/Mabi](https://github.com/minthop/Mabi)）で、家庭の利用者だけが使います。

## 上流との違い

| 変更 | ファイル |
|---|---|
| デザインをデジタル庁デザインシステム（DADS）に置き換える（色・書体・フォーカスの表示・既定をライトに） | `src/lib/mabi/dads.css`、`src/routes/+layout.svelte`（読み込みの 1 行）、`src/app.html`（既定のテーマの 1 行） |
| サーバーの画面（状態とキュー・1 週間の予定と実績・番組・録画と派生物・モデルの台帳・報告） | `src/routes/(app)/mabi/`、`src/lib/components/mabi/`、`src/lib/mabi/` |
| サイドバーに「サーバー」を常に出す | `src/lib/components/layout/Sidebar.svelte` |
| イメージのビルドと上流の取り込み | `.github/workflows/mabi-image.yml`、`.github/workflows/mabi-sync.yml` |

上流の差分を小さく保つため、追加の画面は独立したページと部品にし、上流のファイルの変更は数行に留めています。

## ブランチ

- `mabi`: このフォークの本体。`mabi-image` がここからイメージ（`ghcr.io/minthop/open-webui:mabi-<sha>`）を作る
- `main`: 上流の写し（触らない。上流の workflow は main・dev・タグで動くため、`mabi` では動かない）
- `sync/<タグ>`: `mabi-sync` が週 1 回作る、上流のリリースの取り込みの PR

## データ

画面のデータは、同じホストの `/mabi-api/`（Caddy が mabi-web に中継する）の読み取り専用の JSON です。形は Mabi の ADR 0035 と `crates/mabi-web/src/api.rs` を見てください。

## ライセンス

Open WebUI License（`LICENSE`）に従います。「Open WebUI」の名前・ロゴは消していません。
