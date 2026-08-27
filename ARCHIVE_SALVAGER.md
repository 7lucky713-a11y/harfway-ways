# HARF-WAY Archive Salvager v0.1

Preview branch for salvaging past HARF-WAY articles into the unified game data workflow.

## MVP

- Paste a `harf-way.com` article URL.
- Fetch the article server-side.
- Load the current WAYS game list from `/api/games-live`.
- Match article text against existing game titles.
- Let the editor confirm game links.
- Save results as browser-local drafts for preview validation.
- `Save and next` supports repetitive archive work.

## Safety

This preview does **not** write to the production Neon database. The next step is to add dedicated article/content relation tables on a Neon temporary branch, test them, and only merge after explicit Production approval.
