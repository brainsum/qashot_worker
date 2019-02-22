#!/usr/bin/env bash

git pull

./docker.image-pull.sh

./docker.build.sh && \
    ./docker.restart.prod.sh

./docker.cleanup.sh
