#!/usr/bin/env bash

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
COMPOSE_MISC_OPTIONS="-d --remove-orphans"
COMPOSE_SCALE_OPTIONS="--scale backstopjs_worker_chrome=3"

docker-compose ${COMPOSE_FILES} up ${COMPOSE_MISC_OPTIONS} ${COMPOSE_SCALE_OPTIONS}

echo "Waiting a bit for services to start up.."
sleep 4
docker-compose ps
