# HARF-WAY WAYS

GitHub is the source of truth for the WAYS public frontend.

- `main`: Preview / development baseline
- `production`: Production release branch

Release flow: edit → Preview → approval → Production.

## Archive Salvager

The Archive Salvager Preview now prefers the WordPress REST API for article content. It discovers the public post type/rest base from `/wp-json/wp/v2/types`, fetches the post by slug, and extracts readable article text from that content. If REST data is unavailable, it falls back to readable HTML text blocks (`p`, headings, lists, blockquotes). Images and game/store hints are collected separately.
