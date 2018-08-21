#!/usr/bin/env bash

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.monitoring.yml"
COMPOSE_MISC_OPTIONS="-d --remove-orphans"
COMPOSE_SCALE_CHROME="--scale backstopjs_worker_chrome=3"
COMPOSE_SCALE_FIREFOX="--scale backstopjs_worker_firefox=3"

docker-compose ${COMPOSE_FILES} up ${COMPOSE_MISC_OPTIONS} ${COMPOSE_SCALE_CHROME} ${COMPOSE_SCALE_FIREFOX}

echo "Waiting a bit for services to start up.."
sleep 4
docker-compose ${COMPOSE_FILES} ps
