# Makefile for PetaVision
# Python deps are managed by uv (https://docs.astral.sh/uv/).
# Go deps via `go mod`. Node deps inside web/.

UV := $(shell command -v uv 2> /dev/null)

# ---- Python (uv) ----

check_uv:
ifndef UV
	$(error "uv is not installed. Install: curl -LsSf https://astral.sh/uv/install.sh | sh")
endif
	@uv --version

# Create / sync the Python environment from pyproject.toml (and uv.lock if present).
# Includes the `dev` extra so tests (pytest, milvus-lite, etc.) work out of the box.
setup_env: check_uv
	uv sync --extra dev

# Add a new dependency: `make add PKG=requests`
add: check_uv
	uv add $(PKG)

# Run a command inside the uv-managed venv: `make run CMD="python scripts/api.py"`
run: check_uv
	uv run $(CMD)

# ---- Go ----

tidy:
	go mod tidy

build:
	go build -o sync-engine main.go

# ---- Combined ----

# Default: just the Python env. Run `make tidy` separately if you also need Go.
all: setup_env
	@echo "Python (uv) environment ready. For Go: 'make tidy' or 'make build'."

help:
	@echo "Available targets:"
	@echo "  check_uv      - Verify uv is installed"
	@echo "  setup_env     - uv sync the Python environment"
	@echo "  add PKG=...   - Add a Python dependency via uv"
	@echo "  run CMD=...   - Run a command inside the uv venv"
	@echo "  tidy          - go mod tidy (requires Go)"
	@echo "  build         - Build the Go sync-engine binary (requires Go)"
	@echo "  all           - Sync the Python env (default)"

.PHONY: check_uv setup_env add run tidy build all help
