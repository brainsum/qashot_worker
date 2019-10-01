#!/usr/bin/env bash

COMPOSE_FILES="-f docker-compose.yml"
COMPOSE_MISC_OPTIONS="-d --remove-orphans"
COMPOSE_SCALE_CHROME="--scale backstopjs_worker_chrome=1"
COMPOSE_SCALE_FIREFOX="--scale backstopjs_worker_firefox=1"

docker-compose ${COMPOSE_FILES} up ${COMPOSE_MISC_OPTIONS} ${COMPOSE_SCALE_CHROME} ${COMPOSE_SCALE_FIREFOX}

echo "Waiting a bit for services to start up.."
sleep 5
docker-compose ${COMPOSE_FILES} ps
