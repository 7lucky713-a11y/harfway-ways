# HARF-WAY Tool Sync Contract

HARF-WAY関連ツールを新しく作るときは、CONTROL CENTER連携までを完成条件に含める。

## Standard

1. Production公開URLを持つ。
2. ルートに `/harfway-tool.json` を置く。
3. 既存Vercel HUBへ新しい一意IDで登録する。
4. CONTROL CENTERはHUBの新IDを自動検出する。
5. manifestが取得できる場合はmanifest情報を優先して表示する。
6. Preview / test / staging用途はACTIVE SYSTEMSへ自動昇格させない。

## Manifest schema v1

```json
{
  "schema_version": 1,
  "harfway": true,
  "id": "unique-tool-id",
  "name": "TOOL NAME",
  "group": "DATA / CORE | CREATE | PUBLISH | OPERATE",
  "role": "短い役割",
  "description": "何をするツールか",
  "project_slug": "vercel-project-slug",
  "public_url": "https://example.vercel.app/",
  "admin_url": "https://example.vercel.app/admin",
  "metrics_url": "https://example.vercel.app/metrics",
  "control_center": {
    "sync": true,
    "health_url": "https://example.vercel.app/"
  }
}
```

## Creation rule

今後ChatGPTがHARF-WAY関連のVercelツールを作る場合、ユーザーから明示的に除外指定がない限り、以下を標準工程にする。

- `harfway-tool.json` を同梱
- HUB登録用メタデータを作成
- CONTROL CENTERで同期確認
- Preview確認
- ユーザーの明示的な「本番OK」後にProduction反映

## Auto classification fallback

manifestの `group` がない場合は、HUBの名称・カテゴリ・説明からCONTROL CENTERが次の順で推定する。

- DB / R2 / archive / salvage / importer / extractor → DATA / CORE
- editor / factory / stock / flyer / tool → CREATE
- analytics / metrics / cleanup / hub / ads / monitor / ops → OPERATE
- content / showcase / playlist / public experience → PUBLISH
