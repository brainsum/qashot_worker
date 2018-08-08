#!/usr/bin/env bash

git pull
./docker.build.sh
./docker.cleanup.sh
./docker.restart.prod.sh
