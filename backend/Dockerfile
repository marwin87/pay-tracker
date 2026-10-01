FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY . .
# Shared translations + locales.json, owned by the frontend (see docker-compose additional_contexts)
COPY --from=i18n . /app/i18n

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
