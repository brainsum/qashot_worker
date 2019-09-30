#!/usr/bin/env bash

DOCKER_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
DOCKER_PUSH_SERVICES="backstopjs_worker_chrome backstopjs_worker_firefox backstopjs_worker_phantomjs frontend result_queue"
docker-compose ${DOCKER_FILES} push ${DOCKER_PUSH_SERVICES}
