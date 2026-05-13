# CLAUDE.md

Guidance for Claude Code (and other agentic tools) working in this repo.

## What this is

**PetaVision** — a fullstack NAS image indexing & semantic-search system, built for textile manufacturers with petabyte-scale image libraries.

Three runtimes, intentionally:

| Layer | Language | Purpose |
|-------|----------|---------|
| **Sync engine** | Go (1.21) | Walks the NAS, generates thumbnails, drives the embedding pipeline, writes to SQLite. Concurrency-heavy; this is why it's Go, not Python. |
| **AI/ML pipeline** | Python (3.11) | Loads CLIP (`hf-hub:laion/CLIP-ViT-H-14-laion2B-s32B-b79K`), generates embeddings, talks to Milvus, serves the Flask search API, runs the Firebase task consumer (text2img / img2img / upscale / PSD layering). |
| **Web UI** | Next.js 14 (App Router) | Search + browse + admin + generation surfaces. Firebase auth. |

Architecture flow:
```
NAS  →  Go SyncEngine  →  thumbnails3/ + SQLite (.local/db2/foo.db)
                          │
                          ├─ spawns:  python scripts/sync.py  →  CLIP embeddings (.local/embs3/*.npy)
                          │                                       Milvus collection
                          └─ then:    SyncMilvus (Go) commits vectors

Flask (scripts/api.py)  ←  Next.js (web/)  ←  user
```

## Toolchain — important

- **Python: `uv` only.** Do not reintroduce conda / `environment.yml` / `requirements.txt`. The single source of truth is `pyproject.toml`; `uv sync` provisions `.venv/`. The old conda setup was removed in the migration to uv.
- **Go: keep.** The sync engine is built in Go on purpose (file walking + concurrent thumbnailing at NAS scale). Don't suggest porting it to Python.
- **Node.js: use whichever lockfile is canonical in `web/`** (currently `yarn.lock` lives alongside `package-lock.json` and the root has a `pnpm-lock.yaml` — there's lockfile drift; surface it before changing things).

## Commands

```bash
# One-time setup (after cloning)
make all                              # tidy go.mod, uv sync python env

# Run the indexer (full re-scan)
go run main.go -rootFilePath=/mnt/nas/images -force

# Incremental sync (no-ops if <6h since last run, or another run is in progress)
go run main.go -rootFilePath=/mnt/nas/images -sync

# API server
uv run python scripts/api.py

# Firebase task consumer (image generation / upscale / PSD layering)
uv run python scripts/consumer.py

# Web frontend
cd web && npm run dev
```

## Required runtime config

A `config.ini` (gitignored) must exist at the repo root:

```ini
[milvus]
uri=http://localhost:19530
user=root
password=Milvus
collection=image_collection

[server]
host=0.0.0.0
port=5050
dev=true
thumbnail_dir=.local/thumbnails3
emb_dir=.local/embs3
cache_dir=.cache
json_file=.local/temp.json
```

`scripts/consumer.py` also requires `scripts/firebase_admin.json` (gitignored).

## Repo layout (load-bearing only)

```
main.go                        Entry point + sync gating logic
engine/
  core.go                      Init + BeginOrResume orchestrator
  file_sync.go                 Concurrent NAS walk → SQLite
  thumbnail_generation.go      512x512 thumbnails via nfnt/resize, sha1-hashed names
  generating_embedding.go      Shells out to `python scripts/sync.py`
  sync_to_milvus.go            Reads .npy files, upserts vectors
models/{file,dir,syncs}/       SQLite handlers + struct definitions
utils/db.go                    SQLite singleton at .local/db2/foo.db
scripts/
  api.py                       Flask search API (/search, /tags, /get-embedding, /images, /thumb)
  sync.py                      SyncDir — CLIP indexing batch driver
  clip.py                      ImagesIndexer + ImagesDataset (open_clip)
  milvus.py                    pymilvus wrapper (FLAT index, 512-dim, L2)
  caption.py                   BLIP caption stub (currently a no-op)
  consumer.py                  Firebase realtime DB task consumer
  fast_layer_decompostion.py   PSD layering pipeline (calls fast_layer_decompostion_core/)
  generate_psd.js              ag-psd PSD writer invoked from Python via Node
web/src/app/                   Next.js App Router (page.js, admin/, ai/, digital/, gen/, upscale/)
```

## Conventions / gotchas

- **Embedding dim mismatch**: CLIP-ViT-H-14 outputs 1024-dim vectors, but `scripts/milvus.py` declares `self.DIM = 512`. If the collection is recreated, schema/model must be reconciled. (Existing collections may be on a smaller model.)
- **Manual SQL string formatting**: `models/file/handler.go:189` interpolates `file_path` into a `fmt.Sprintf` UPDATE statement. Internal-only today, but treat as a known issue if it ever sees user input.
- **Hardcoded Milvus token** in `scripts/milvus.py:11` (Zilliz Cloud bearer). Should move to `config.ini` / env var.
- **Thumbnail addressing**: each thumbnail's filename is `sha1(filePath).jpeg`. The Python side trusts that the Go side has already produced this — see `DocumentsToRow` in `models/file/handler.go`.
- **`scripts/sync.py` breaks after the first batch**: there's a `break` after the first 10k-row chunk in `engine/generating_embedding.go:62`. Indexing >10k files in one run currently requires manually re-running.
- **`.local/`** holds all derived state (logs, thumbnails3/, embs3/, db2/foo.db, last_synced.json). Safe to wipe; will trigger a full re-sync.
- **`identifier.sqlite`** at the repo root is an empty placeholder, not the live DB.

## Style & defaults

- This is a personal/small-team project; favor pragmatic fixes over architectural rewrites unless asked. The Go code has commented-out experiments scattered around — don't aggressively delete unless cleanup is the task.
- For UI changes, run `npm run dev` from `web/` and verify in a browser before claiming done.
- Don't create docs (`*.md`) the user didn't ask for. This file and `README.md` are the only ones expected.

## Out of scope by default

- Reintroducing conda.
- Rewriting the Go sync engine in Python (or vice versa).
- Touching `web/package.json` lockfiles (yarn vs pnpm vs npm) — surface and ask.
