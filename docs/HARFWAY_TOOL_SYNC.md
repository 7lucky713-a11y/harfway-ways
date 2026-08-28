# HARF-WAY Tool Sync Contract

HARF-WAY関連ツールを新しく作るときは、CONTROL CENTER連携とAnalytics維持までを完成条件に含める。

## Standard

1. Production公開URLを持つ。
2. ルートに `/harfway-tool.json` を置く。
3. 既存Vercel HUBへ新しい一意IDで登録する。
4. CONTROL CENTERはHUBの新IDを自動検出する。
5. manifestが取得できる場合はmanifest情報を優先して表示する。
6. Preview / test / staging用途はACTIVE SYSTEMSへ自動昇格させない。
7. 公開サービスは既存Analytics計測を改良時も維持する。
8. UI刷新・branch切替・Promote前に、GA4/独自計測コードと主要イベントが残っていることをPreviewで確認する。

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
  },
  "analytics": {
    "required": true,
    "provider": "ga4",
    "measurement_id": "G-LQVHR07K15",
    "verify_before_production": true
  }
}
```

## Creation rule

今後ChatGPTがHARF-WAY関連のVercelツールを作る場合、ユーザーから明示的に除外指定がない限り、以下を標準工程にする。

- `harfway-tool.json` を同梱
- HUB登録用メタデータを作成
- CONTROL CENTERで同期確認
- 公開サービスはAnalytics計測を実装または既存計測を維持
- Previewで page_view と主要イベントの送信経路を確認
- UI改良・別branchからのPromote時もAnalytics差分を確認
- 可能なプロジェクトではbuild-time analytics guardを設置し、計測コード欠落時はbuildを失敗させる
- Preview確認
- ユーザーの明示的な「本番OK」後にProduction反映

## Release rule for existing tools

HARF-WAYの既存ツールを改良・再デプロイ・Promoteする場合も、新規制作と同じAnalytics確認を必須とする。

1. 現Productionで取得している計測対象を確認する。
2. 改良Previewにも同じMeasurement ID / service_name / content_typeを維持する。
3. UI変更でイベント導線が変わった場合、イベントフックを新UIへ追従させる。
4. Previewで計測コードの配信を確認する。
5. Realtimeまたはdebug計測で着弾を確認できる場合は確認する。
6. Analyticsを失う変更はProductionへPromoteしない。

## Auto classification fallback

manifestの `group` がない場合は、HUBの名称・カテゴリ・説明からCONTROL CENTERが次の順で推定する。

- DB / R2 / archive / salvage / importer / extractor → DATA / CORE
- editor / factory / stock / flyer / tool → CREATE
- analytics / metrics / cleanup / hub / ads / monitor / ops → OPERATE
- content / showcase / playlist / public experience → PUBLISH
