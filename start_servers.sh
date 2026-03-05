#!/bin/bash
source venv/bin/activate
echo "Starting Django API..."
python manage.py runserver 8000 &
P1=$!

echo "Starting Celery (default queue)..."
celery -A config worker --queues=default -c 2 -l info &
P2=$!

echo "Starting Celery (embedding queue)..."
celery -A config worker --queues=embedding -c 1 -l info &
P3=$!

echo "Starting React Frontend..."
cd frontend && npm run dev &
P4=$!

echo "All services started. PIDs: $P1, $P2, $P3, $P4"
echo $P1 > ../server.pid
echo $P2 >> ../server.pid
echo $P3 >> ../server.pid
echo $P4 >> ../server.pid

# Keep running
wait
