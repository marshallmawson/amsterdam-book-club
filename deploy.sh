#!/bin/bash

# Cloud Run Deployment Script
# Usage: ./deploy.sh [environment]
# Example: ./deploy.sh production

set -e

# Configuration
PROJECT_ID="no-mans-book-club"
PROJECT_NUMBER="944361216321"
SERVICE_NAME="no-man-s-book-club"  # Based on your app URL
REGION="us-west1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment to Cloud Run...${NC}"

# Load environment variables from .env.local if it exists and variables aren't already set
if [ -f .env.local ]; then
    echo -e "${GREEN}Loading environment variables from .env.local...${NC}"
    set -a
    source .env.local
    set +a
fi

# Check if required environment variables are set
MISSING_VARS=()
if [ -z "$GEMINI_API_KEY" ]; then
    MISSING_VARS+=("GEMINI_API_KEY")
fi
if [ -z "$VITE_FIREBASE_API_KEY" ]; then
    MISSING_VARS+=("VITE_FIREBASE_API_KEY")
fi
if [ -z "$VITE_FIREBASE_PROJECT_ID" ]; then
    MISSING_VARS+=("VITE_FIREBASE_PROJECT_ID")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Warning: The following environment variables are not set:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${YELLOW}  - $var${NC}"
    done
    echo -e "${YELLOW}Please set them before deploying.${NC}"
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Set the project
echo -e "${GREEN}Setting GCP project to ${PROJECT_ID}...${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "${GREEN}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Use Cloud Build to build and deploy (no Docker Desktop needed!)
echo -e "${GREEN}Building and deploying with Cloud Build (no local Docker required)...${NC}"
gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_GEMINI_API_KEY="${GEMINI_API_KEY}",_VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY}",_VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}",_VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}",_VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET}",_VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID}",_VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID}",_VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID}",_SERVICE_NAME="${SERVICE_NAME}",_REGION="${REGION}"

echo -e "${GREEN}Deployment complete!${NC}"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)' 2>/dev/null || echo "N/A")
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}Expected URL: https://no-man-s-book-club-315949479081.us-west1.run.app${NC}"
echo -e "${GREEN}Custom URLs: https://nomansbookclub.com, https://www.nomansbookclub.com${NC}"
