#!/usr/bin/env bash

if [ ! -f ./vendor/hadolint ]; then
    echo "Hadolint not found, get the latest version here: https://github.com/hadolint/hadolint/releases"
    exit 1
fi

./vendor/hadolint ./frontend/Dockerfile
./vendor/hadolint ./backstopjs_worker/Dockerfile
