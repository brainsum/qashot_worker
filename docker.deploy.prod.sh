#!/usr/bin/env bash

git pull

./docker.image-pull.sh

./docker.startup.prod.sh

./docker.cleanup.sh
