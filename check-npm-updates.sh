#!/usr/bin/env bash

services=('frontend' 'backstopjs_worker' 'result_queue')

for service in "${services[@]}"
do
  echo "NPM status for ${service}:"
  cd "${service}" && npm outdated -l
  npm audit
  cd ..
  echo ""
done
