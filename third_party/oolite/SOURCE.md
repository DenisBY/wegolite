# Vendored Oolite snapshot

Oolite release **1.93.1-241**, commit **`7437f22`**, from
<https://github.com/OoliteProject/oolite>.

Retrieved **2026-11-03** with:

```bash
docker compose run --rm assets sh scripts/vendor-oolite.sh
```

`scripts/vendor-oolite.sh` is the only sanctioned way these bytes enter the
repository. It downloads the pinned files, rewrites `CHECKSUMS.sha256` and
`pin.json`, and updates the SHA-256 cells of every `third_party/oolite/` row in
`ASSETS.md` from the bytes it just wrote.

## Bumping the pin

A later Oolite release enters only through a deliberate bump: change the
release/commit/retrieved values in `scripts/vendor-oolite.sh`, re-run it (which
rewrites `CHECKSUMS.sha256`, `pin.json` and every `ASSETS.md` hash), regenerate
content, and read the diff. `verify` stays red until every difference is
reviewed and committed. There is no override and no allowlist.
