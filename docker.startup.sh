#!/usr/bin/env bash

docker-compose up -d --remove-orphans --scale backstopjs_worker_chrome=3

sleep 2

docker-compose ps
