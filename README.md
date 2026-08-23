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
