# How to Run LinkVault Locally

Running your project locally is extremely easy because your React frontend is already permanently hooked up to your live AWS Serverless backend! 

This means you do NOT need to run a local database or local AWS container. You just need to run the React UI!

### Option 1: The One-Click Method (Windows)
We have created a `start-local.bat` file in the root of your project.
1. Simply **double-click `start-local.bat`** from your File Explorer.
2. It will open a terminal, start the server, and give you the local link.
3. Open `http://localhost:5173` in your browser.

### Option 2: The Command Line Method
If you ever want to run it manually via your terminal (VS Code, Command Prompt, or PowerShell):
1. Open a terminal in this project folder.
2. Navigate into the frontend folder:
   ```bash
   cd frontend
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser to `http://localhost:5173`.

### Making Changes
While the local server is running, any changes you make to the code in the `frontend/src/` folder will **instantly update** in your browser without needing to refresh!

Enjoy!
