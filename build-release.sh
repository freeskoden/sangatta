#!/bin/bash

# Sangatta Release Builder
# This script builds the frontend and packages both backend and frontend into a single tarball.

set -e

echo "Building Sangatta Release..."

# Ensure we are in the project root
cd "$(dirname "$0")"

# 1. Build frontend
echo "Building Frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Prepare staging directory
echo "Preparing staging directory..."
rm -rf staging
mkdir -p staging/sangatta/backend
mkdir -p staging/sangatta/frontend

# 3. Copy files
echo "Copying files..."
cp -r backend/index.js backend/db.js backend/package.json backend/package-lock.json staging/sangatta/backend/
cp -r frontend/dist staging/sangatta/frontend/

# 4. Package tarball
echo "Creating tarball..."
cd staging
tar -czvf ../sangatta-linux-x64.tar.gz sangatta
cd ..

# Cleanup
rm -rf staging

echo ""
echo "============================================================"
echo "Release built successfully: sangatta-linux-x64.tar.gz"
echo "Please create a new Release on your GitHub repository and"
echo "upload this file as an asset."
echo "============================================================"
