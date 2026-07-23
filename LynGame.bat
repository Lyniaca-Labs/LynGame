@echo off

cd source
cd server

start "" cmd /k "npm start"

timeout /t 3 /nobreak >nul

start "" http://localhost:5664