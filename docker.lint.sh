#!/usr/bin/env bash

hadolintVersion="v1.17.2"
projectRoot="${0%/*}"

files=(\
  "backstopjs_worker/Dockerfile-phantomjs" \
  "backstopjs_worker/Dockerfile-firefox" \
  "backstopjs_worker/Dockerfile-chrome" \
  "frontend/Dockerfile" \
  "result_queue/Dockerfile"
)

echo "Linting with hadolint ${hadolintVersion}"
echo ""

for file in "${files[@]}";
do
  echo "Linting file ${projectRoot}/${file}"
  docker run --rm -i hadolint/hadolint:${hadolintVersion} < "${projectRoot}/${file}" && echo "Ok"
  echo ""
done
