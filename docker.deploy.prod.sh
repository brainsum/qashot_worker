#!/usr/bin/env bash

git pull
./docker.build.sh && \
    ./docker.restart.prod.sh

./docker.cleanup.sh
