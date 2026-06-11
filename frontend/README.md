# LinkVault Frontend

This is the React frontend for LinkVault, an advanced serverless URL shortener.
It was built using **Vite**, **React**, and styled with a clean, modern SaaS aesthetic.

## Features
- **Dashboard:** Create shortened URLs and view global statistics.
- **My Links:** Search, filter, manage, and download QR codes for all your generated short links.
- **Analytics:** View detailed metrics (Country, OS, Browser, Clicks over time) visualized with `react-chartjs-2`.
- **Authentication:** Secure login and registration flows communicating directly with AWS API Gateway.

## Environment Setup

The frontend expects an API endpoint to communicate with the AWS Serverless backend.
In the `src/config.js` file, ensure `API_BASE` points to your active environment.

```javascript
// src/config.js
export const CONFIG = {
  apiBase: 'https://<your-api-id>.execute-api.ap-south-1.amazonaws.com/Prod'
};
```

## Available Scripts

In the project directory, you can run:

### `npm install`
Installs all dependencies.

### `npm run dev`
Runs the app in development mode using Vite.
Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

The page will reload if you make edits.
You will also see any lint errors in the console.

### `npm run build`
Builds the app for production to the `dist` folder.
It correctly bundles React in production mode and optimizes the build for the best performance.

## Deployment (Vercel)

This frontend is designed to be easily deployed on [Vercel](https://vercel.com).
1. Add your GitHub repository to Vercel.
2. Set the **Root Directory** to `frontend`.
3. Vercel will automatically detect the Vite framework and configure the build settings.
4. Click Deploy!
