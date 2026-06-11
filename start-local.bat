@echo off
echo ===================================================
echo     Starting LinkVault React Frontend Server...
echo ===================================================
echo.
echo Your frontend will be available at: http://localhost:5173
echo (Note: Your frontend is already configured to talk to your live AWS backend!)
echo.
cd frontend
npm run dev
pause
