FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev
# Run tools straight from the venv; `uv run` would re-sync and pull in dev deps on every start
ENV PATH="/app/.venv/bin:$PATH"

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY . .
# Shared translations + locales.json, owned by the frontend (see docker-compose additional_contexts)
COPY --from=i18n . /app/i18n

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
