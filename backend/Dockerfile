FROM python:3.13-slim

# Install PostgreSQL 17 + supervisor, then drop the Debian-managed default
# cluster so our entrypoint can initdb a self-contained one (postgresql.conf
# lives inside the data dir, not /etc/postgresql, which makes -D work cleanly).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg lsb-release \
    && echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17 supervisor \
    && pg_dropcluster --stop 17 main \
    && rm -rf /etc/postgresql /var/lib/apt/lists/*

RUN mkdir -p /var/lib/postgresql/17/main \
    && chown -R postgres:postgres /var/lib/postgresql

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

COPY . .

COPY supervisord.conf /etc/supervisor/conf.d/paytracker.conf
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
