#!/usr/bin/env bash

docker-compose up -d --remove-orphans --scale backstopjs_worker=3

sleep 2

docker-compose ps
