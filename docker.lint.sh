#!/usr/bin/env bash

if [ ! -f ./vendor/hadolint ]; then
    echo "Hadolint not found, get the latest version here: https://github.com/hadolint/hadolint/releases"
    exit 1
fi

echo "Linting files with $(./vendor/hadolint --version)"

./vendor/hadolint ./frontend/Dockerfile
echo ""
./vendor/hadolint ./backstopjs_worker/Dockerfile-chrome
echo ""
./vendor/hadolint ./backstopjs_worker/Dockerfile-firefox
echo ""
./vendor/hadolint ./backstopjs_worker/Dockerfile-phantomjs
echo ""
./vendor/hadolint ./result_queue/Dockerfile
echo ""
