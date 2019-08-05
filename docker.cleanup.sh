#!/usr/bin/env bash

docker rmi "$(docker images -f 'dangling=true' -q)"
docker volume rm "$(docker volume ls -qf dangling=true)"
