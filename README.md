<div align="center">
  <img src="https://storage.googleapis.com/ai-studio-bucket-944361216321-us-west1/Images/nomans-logo.png" alt="No Man's Book Club Logo" width="400" />
  
  <img src="https://storage.googleapis.com/ai-studio-bucket-944361216321-us-west1/Images/nomans-drawing.png" alt="No Man's Book Club Drawing" width="600" style="margin-top: 20px;" />
</div>

# No Man's Book Club

A modern web application for managing book club proposals, voting, and meetings. Members can submit book recommendations, vote on their favorites, and schedule discussion meetings—all in one place.

## Features

- 📚 **Book Proposals**: Submit up to 3 book recommendations with AI-powered summaries
- 📖 **Google Books Integration**: Automatically fetches book metadata, covers, descriptions, and details from the Google Books API
- 🗳️ **Voting System**: Cast up to 10 votes (upvotes and downvotes) to help select the next book
- 📅 **Meeting Scheduling**: Schedule and track book club meetings
- 👥 **User Authentication**: Secure login system with Firebase Authentication
- 🤖 **AI Summaries**: Automatic book description summarization using Google's Gemini AI
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

## How It Works

1. **Submit Books**: Members can propose books they'd like to read (up to 3 submissions)
   - Simply enter the book title and author
   - The app automatically searches the **Google Books API** to fetch:
     - Book cover images
     - Full descriptions
     - Publication year
     - Page count
     - Genre/categories
   - Book descriptions are then summarized using **Gemini AI** for quick reading
2. **Vote**: Each member gets 10 votes total, with up to 3 upvotes or downvotes per book
3. **Review**: See all proposals, vote counts, and member submissions
4. **Schedule**: Plan meetings for selected books
5. **Track**: View your voting history and submissions

## Real-Time Synchronization

The app uses **Firebase Firestore** as its database, providing real-time synchronization across all devices. This means:

- ✅ **Instant Updates**: When a member submits a book or casts a vote, all other members see the changes immediately—no page refresh needed
- ✅ **Cross-Device Sync**: Your submissions and votes are automatically synced across all your devices (phone, tablet, computer)
- ✅ **Live Collaboration**: Multiple members can vote and submit simultaneously, with all changes reflected in real-time
- ✅ **Persistent Data**: All book submissions, votes, and meeting schedules are securely stored in Firestore and persist across sessions
- ✅ **Offline Support**: Firestore provides offline persistence, so you can view your data even when temporarily disconnected

## Run Locally

**Prerequisites:** Node.js

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

   See [ENV_SETUP.md](./ENV_SETUP.md) for detailed instructions on finding these values.

3. Run the app:
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

**Note:** The `.env.local` file is already in `.gitignore` and will not be committed to git. Never commit your actual API keys or secrets to the repository.

## Deployment

This app is configured for deployment to Google Cloud Run. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy:
```bash
./deploy.sh
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Database**: Firebase Firestore (real-time NoSQL database)
- **Authentication**: Firebase Auth
- **Book Data**: Google Books API (for book metadata, covers, and descriptions)
- **AI**: Google Gemini API (for book description summarization)
- **Hosting**: Google Cloud Run
- **DNS**: Cloudflare

## License

This project is private and proprietary.
