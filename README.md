# LearningOS AI v2

This version needs Vercel (or another Node serverless host) for live AI.

## Deploy
1. Replace the files in your existing GitHub `microlearn` repository with all files/folders in this package.
2. Create a free Vercel account and choose "Add New Project".
3. Import the GitHub `microlearn` repository.
4. In Vercel Project Settings > Environment Variables add:
   OPENAI_API_KEY = your OpenAI API key
   OPENAI_MODEL = gpt-5-mini   (optional)
5. Deploy.

Vercel will give you a new HTTPS URL. Open that URL in Chrome and install it to the home screen.

## How personalization works
The user profile stays in browser localStorage:
- Like: strong positive topic/source/tag signal
- Dislike: strong negative signal
- Save: strongest positive signal
- Dwell: small positive implicit signal
- Fast/negative interaction: small negative signal
- Quiz misses: remembered for future review
- Exploration: AI is instructed to include one useful adjacent item

The compact preference profile is sent with each live feed request so the AI ranks and transforms current stories for that user without requiring a database.

## News
The backend searches Google News RSS across Reuters, Globes, Ynet, TechCrunch and broader robotics/AI/autonomy queries, then uses AI to select and transform the highest-signal items.

## Important
Never place OPENAI_API_KEY in index.html or any browser-side JavaScript.

## Forecasts (Foresight tab)
Each feed batch puts a forecast question on 2-3 cards, with a mix of 1 week, 1 month, 3 month, 6 month and 12 month deadlines. You pick an outcome and how sure you are, and the AI records its own forecast too.
When a deadline passes, `/api/forecast` asks the AI (with web search) what actually happened and scores you and the AI (Brier score). You can correct a wrong verdict.
The Foresight tab shows your hit rate, calibration, accuracy by topic and by time range, you vs the AI, and your daily time in the app.
Forecasts are stored on the phone and backed up to Redis (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) so they survive a cleared browser.

## Android tracker (junk-time measurement)
`android/` is a small companion app that measures daily minutes on Ynet, Walla and LinkedIn and sends them to `/api/usage`. It never blocks anything.
- LinkedIn app (and Ynet/Walla apps if installed): Android usage access.
- Ynet/Walla/LinkedIn in Chrome: an accessibility service that reads only Chrome's address bar and keeps minutes per site.

GitHub Actions builds the APK on every push that touches `android/` and publishes it under Releases (`tracker-vN`). On the phone: download `LearningOS-Tracker.apk`, install, then in LearningOS open Foresight → "Connect Android tracker".
The signing key in `android/app/tracker.keystore` is a fixed key for this sideloaded app so updates install over each other; it is not meant for the Play Store.
