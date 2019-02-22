#!/usr/bin/env bash

DOCKER_FILES="-f docker-compose.yml"
DOCKER_PULL_SERVICES="backstopjs_worker_chrome backstopjs_worker_firefox backstopjs_worker_phantomjs frontend result_queue"
docker-compose ${DOCKER_FILES} pull ${DOCKER_PULL_SERVICES}
