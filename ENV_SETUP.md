# Environment Variables Setup Guide

This guide explains how to find and set up all the required environment variables for the No Man's Book Club app.

## Two Different API Keys

The app requires **two separate API keys** that serve different purposes:

### 1. Gemini API Key
- **Purpose**: Used for AI book summarization
- **Where to get it**: 
  - Go to https://aistudio.google.com/apikey
  - Create or copy your API key
- **Environment Variable**: `GEMINI_API_KEY`

### 2. Firebase API Key (Browser Key)
- **Purpose**: Used for Firebase services (Firestore database, Authentication)
- **Where to get it**: 
  - Go to [Google Cloud Console](https://console.cloud.google.com/)
  - Navigate to: APIs & Services > Credentials
  - Look for "Browser key (auto created by Firebase)" - this is your Firebase API key
  - OR get it from Firebase Console > Project Settings > General > Your apps
- **Environment Variable**: `VITE_FIREBASE_API_KEY`

**Important**: These are two completely different keys. Do not confuse them!

## Complete Firebase Configuration

To get all your Firebase configuration values:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `no-mans-book-club`
3. Click the gear icon ⚙️ > Project Settings
4. Scroll down to "Your apps" section
5. Click on your web app (or create one if you don't have one)
6. You'll see a config object like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",  // This is VITE_FIREBASE_API_KEY
  authDomain: "no-mans-book-club.firebaseapp.com",  // VITE_FIREBASE_AUTH_DOMAIN
  projectId: "no-mans-book-club",  // VITE_FIREBASE_PROJECT_ID
  storageBucket: "no-mans-book-club.firebasestorage.app",  // VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "944361216321",  // VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:944361216321:web:d018241dc0f6b75a78e9c0",  // VITE_FIREBASE_APP_ID
  measurementId: "G-SZB6H6NS3Y"  // VITE_FIREBASE_MEASUREMENT_ID (optional)
};
```

## Setting Up Your .env.local File

Create a `.env.local` file in the root directory with:

```bash
# Gemini API Key (for AI book summarization)
GEMINI_API_KEY=your-gemini-api-key-from-ai-studio

# Firebase Configuration (from Firebase Console)
VITE_FIREBASE_API_KEY=your-firebase-browser-api-key
VITE_FIREBASE_AUTH_DOMAIN=no-mans-book-club.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=no-mans-book-club
VITE_FIREBASE_STORAGE_BUCKET=no-mans-book-club.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=944361216321
VITE_FIREBASE_APP_ID=1:944361216321:web:d018241dc0f6b75a78e9c0
VITE_FIREBASE_MEASUREMENT_ID=G-SZB6H6NS3Y
```

## For Deployment

When deploying to Cloud Run, set all these environment variables before running `./deploy.sh`:

```bash
export GEMINI_API_KEY='your-gemini-api-key'
export VITE_FIREBASE_API_KEY='your-firebase-browser-api-key'
export VITE_FIREBASE_AUTH_DOMAIN='no-mans-book-club.firebaseapp.com'
export VITE_FIREBASE_PROJECT_ID='no-mans-book-club'
export VITE_FIREBASE_STORAGE_BUCKET='no-mans-book-club.firebasestorage.app'
export VITE_FIREBASE_MESSAGING_SENDER_ID='944361216321'
export VITE_FIREBASE_APP_ID='1:944361216321:web:d018241dc0f6b75a78e9c0'
export VITE_FIREBASE_MEASUREMENT_ID='G-SZB6H6NS3Y'
```

## Security Notes

- ✅ The `.env.local` file is already in `.gitignore` - your secrets won't be committed
- ✅ Firebase API keys are safe to expose in client-side code (they're meant to be public)
- ⚠️ However, you should still restrict your Gemini API key to specific websites in Google Cloud Console
- ⚠️ Never commit actual API keys to GitHub
