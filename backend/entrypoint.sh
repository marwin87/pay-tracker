#!/bin/bash
set -e

PGDATA="/var/lib/postgresql/17/main"
PGBIN="/usr/lib/postgresql/17/bin"
PGUSER="${POSTGRES_USER:-paytracker}"
PGPASSWORD_VAL="${POSTGRES_PASSWORD:-changeme}"
PGDB="${POSTGRES_DB:-paytracker}"

chown -R postgres:postgres /var/lib/postgresql

if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] Initializing PostgreSQL 17..."
    su -s /bin/bash postgres -c \
        "$PGBIN/initdb -D $PGDATA --encoding=UTF8 --locale=C --auth-host=scram-sha-256"

    su -s /bin/bash postgres -c \
        "$PGBIN/pg_ctl -D $PGDATA start -w -l /tmp/pg_init.log"

    su -s /bin/bash postgres -c \
        "psql -c \"CREATE USER $PGUSER WITH PASSWORD '$PGPASSWORD_VAL';\""
    su -s /bin/bash postgres -c \
        "psql -c \"CREATE DATABASE $PGDB OWNER $PGUSER;\""

    su -s /bin/bash postgres -c \
        "$PGBIN/pg_ctl -D $PGDATA stop"
    echo "[entrypoint] PostgreSQL initialized."
fi

exec supervisord -n -c /etc/supervisor/conf.d/paytracker.conf
