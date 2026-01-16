# Cloud Run Deployment Guide

This guide explains how to deploy the No Man's Book Club app to Google Cloud Run.

## Prerequisites

1. **Google Cloud SDK (gcloud)** installed and configured
   ```bash
   # Install gcloud if you haven't already
   # macOS: brew install google-cloud-sdk
   
   # Authenticate
   gcloud auth login
   ```

2. **Docker** installed and running

3. **Environment Variables** - You'll need:
   - `GEMINI_API_KEY` - Your Gemini API key (from AI Studio: https://aistudio.google.com/apikey)
   - `VITE_FIREBASE_API_KEY` - Your Firebase Browser API key (the "Browser key (auto created by Firebase)" from Google Cloud Console)
   - `VITE_FIREBASE_AUTH_DOMAIN` - Your Firebase auth domain
   - `VITE_FIREBASE_PROJECT_ID` - Your Firebase project ID
   - `VITE_FIREBASE_STORAGE_BUCKET` - Your Firebase storage bucket
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` - Your Firebase messaging sender ID
   - `VITE_FIREBASE_APP_ID` - Your Firebase app ID
   - `VITE_FIREBASE_MEASUREMENT_ID` - Your Firebase measurement ID (optional)
   
   **Note:** The Gemini API key and Firebase API key are **different keys** serving different purposes.

## Quick Deploy

### Option 1: Using the deploy script (Recommended)

1. Set your environment variables:
   ```bash
   export GEMINI_API_KEY='your-gemini-api-key-here'
   export VITE_FIREBASE_API_KEY='your-firebase-api-key-here'
   export VITE_FIREBASE_AUTH_DOMAIN='your-project.firebaseapp.com'
   export VITE_FIREBASE_PROJECT_ID='your-project-id'
   export VITE_FIREBASE_STORAGE_BUCKET='your-project.firebasestorage.app'
   export VITE_FIREBASE_MESSAGING_SENDER_ID='your-messaging-sender-id'
   export VITE_FIREBASE_APP_ID='your-app-id'
   export VITE_FIREBASE_MEASUREMENT_ID='your-measurement-id'
   ```

2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```

The script will:
- Build the Docker image with your API key
- Push it to Google Container Registry
- Deploy to Cloud Run

### Option 2: Manual deployment

1. Set your environment variables (see Option 1 above for the full list)

2. Set your GCP project:
   ```bash
   gcloud config set project no-mans-book-club
   ```

3. Build and push the image (with all environment variables):
   ```bash
   docker build \
     --build-arg GEMINI_API_KEY="${GEMINI_API_KEY}" \
     --build-arg VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY}" \
     --build-arg VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}" \
     --build-arg VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}" \
     --build-arg VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET}" \
     --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
     --build-arg VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID}" \
     --build-arg VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID}" \
     -t gcr.io/no-mans-book-club/no-mans-book-club .
   docker push gcr.io/no-mans-book-club/no-mans-book-club
   ```

4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy no-mans-book-club \
     --image gcr.io/no-mans-book-club/no-mans-book-club \
     --platform managed \
     --region us-west1 \
     --allow-unauthenticated \
     --port 8080
   ```

### Option 3: Using Cloud Build (CI/CD)

1. Create a Cloud Build trigger or run manually:
   ```bash
   gcloud builds submit --config=cloudbuild.yaml \
     --substitutions=_GEMINI_API_KEY=your-api-key-here
   ```

2. Or set up a trigger in the Cloud Console with the substitution variable.

## Configuration

Current configuration:
- **Project ID**: `no-mans-book-club`
- **Project Number**: `944361216321`
- **Service Name**: `no-man-s-book-club` (inferred from URL - verify with `gcloud run services list`)
- **Region**: `us-west1`
- **App URL**: `https://no-man-s-book-club-315949479081.us-west1.run.app`
- **Custom URLs**: `nomansbookclub.com`, `www.nomansbookclub.com`

To verify your service name, run:
```bash
gcloud run services list --region us-west1
```

Update these values in `deploy.sh` if they don't match your setup.

## Important Notes

⚠️ **API Key Security**: The Gemini API key is baked into the JavaScript bundle at build time. This is why you have website restrictions configured in Google Cloud Console. Make sure your API key restrictions include:
- `https://no-man-s-book-club-315949479081.us-west1.run.app/*`
- `https://nomansbookclub.com/*`
- `https://www.nomansbookclub.com/*`
- `https://*.nomansbookclub.com/*` (covers subdomains)

## Troubleshooting

### "API key expired" error
1. Verify the API key is set correctly: `echo $GEMINI_API_KEY`
2. Check that the API key restrictions include your Cloud Run URL
3. Wait a few minutes after updating restrictions for them to propagate
4. Check the browser console for detailed error logs

### Build fails
- Ensure Docker is running
- Check that you're authenticated: `gcloud auth list`
- Verify your project ID is correct

### Deployment fails
- Check Cloud Run quotas and limits
- Verify you have the necessary IAM permissions
- Check Cloud Run logs: `gcloud run services logs read no-mans-book-club --region us-west1`

## Updating the Deployment

After making code changes, simply run `./deploy.sh` again to rebuild and redeploy.
