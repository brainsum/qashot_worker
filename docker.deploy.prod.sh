#!/usr/bin/env bash

git pull

./docker.image-pull.sh

./docker.build.sh && \
    ./docker.startup.prod.sh

./docker.cleanup.sh
