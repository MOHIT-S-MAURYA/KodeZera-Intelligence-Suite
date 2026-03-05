#!/bin/sh
# Docker entrypoint — runs migrations + collects static, then starts the app.
# Migrations run at startup (not build time) so that:
#  - The database is guaranteed to be up (depends_on w/ healthcheck)
#  - Schema is always current without rebuilding the image
set -e

echo "=== Kodezera Intelligence Suite ==="
echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "Starting server..."
exec "$@"
