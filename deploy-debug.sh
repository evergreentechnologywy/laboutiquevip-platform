#!/bin/bash
set -e
cd /mnt/c/Users/everg/Projects/laboutiquevip-platform
node ./node_modules/typescript/bin/tsc -p backend/tsconfig.json 2>&1
git add -A
git commit -m "debug: add console.error to catch block"
git push origin master 2>&1
