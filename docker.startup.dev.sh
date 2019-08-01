#!/usr/bin/env bash

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
COMPOSE_MISC_OPTIONS="-d --remove-orphans"
COMPOSE_SCALE_CHROME="--scale backstopjs_worker_chrome=2"
COMPOSE_SCALE_FIREFOX="--scale backstopjs_worker_firefox=2"
COMPOSE_SCALE_PHANTOMJS="--scale backstopjs_worker_phantomjs=2"

docker-compose ${COMPOSE_FILES} up ${COMPOSE_MISC_OPTIONS} ${COMPOSE_SCALE_CHROME} ${COMPOSE_SCALE_FIREFOX} ${COMPOSE_SCALE_PHANTOMJS}

echo "Waiting a bit for services to start up.."
sleep 4
docker-compose ${COMPOSE_FILES} ps

#docker-compose logs -f
