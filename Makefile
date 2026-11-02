.PHONY: check demo-up

check:
	uv run pytest -v
	@if [ -d "ui" ]; then cd ui && npm run build; else echo "ui/ not present; skipping frontend build"; fi

demo-up:
	./scripts/dev.sh
