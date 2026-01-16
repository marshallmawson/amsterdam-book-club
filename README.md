<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1yJK6Efsn0is9BXq0cRQxCBNwB9gAV52M

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the root directory with your environment variables:
   ```bash
   # Gemini API Key (for AI book summarization)
   # Get this from: https://aistudio.google.com/apikey
   GEMINI_API_KEY=your-gemini-api-key-here

   # Firebase Configuration (for Firestore database and authentication)
   # Get these from: Firebase Console > Project Settings > General > Your apps
   # The API key is the "Browser key (auto created by Firebase)" in Google Cloud Console
   VITE_FIREBASE_API_KEY=your-firebase-browser-api-key-here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

   **Important:** The Firebase API key and Gemini API key are **different keys**:
   - **Gemini API Key**: Used for AI book summarization (from AI Studio)
   - **Firebase API Key**: The "Browser key (auto created by Firebase)" from Google Cloud Console, used for Firestore and Firebase Auth

3. Run the app:
   ```bash
   npm run dev
   ```

**Note:** The `.env.local` file is already in `.gitignore` and will not be committed to git. Never commit your actual API keys or secrets to the repository.
