#!/usr/bin/env bash

docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml -f docker-compose.dev.yml build --force-rm #--no-cache
