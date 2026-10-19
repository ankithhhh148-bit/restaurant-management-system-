@echo off
cd /d "%~dp0"
if not exist "static\images\*.jpg" (
  echo Downloading dish photos ^(first run only^)...
  python fetch_images.py || py fetch_images.py
)
python rms_server.py || py rms_server.py
pause
