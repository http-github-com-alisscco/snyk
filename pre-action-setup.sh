#!/bin/bash

cd test/fixtures
mkdir cloned
cd cloned
pwd

export GH_ORG=teodora-sandu
export GH_REPO=test

git clone git@github.com:${GH_ORG}/${GH_REPO}.git
cd ${GH_REPO}
export GH_COMMIT_SHA=$(git rev-parse HEAD)

cd ../../../../

npx jest test/jest/acceptance/iac/actions.spec.ts

rm -rf test/fixtures/cloned