@echo off
setlocal

set ROOT=%~dp0
set VENV=%ROOT%\.venv

if not exist "%VENV%\Scripts\python.exe" (
  echo Creating venv...
  python -m venv "%VENV%"
)

echo Installing backend dependencies...
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV%\Scripts\python.exe" -m pip install -r "%ROOT%\requirements.txt"

echo Starting backend...
"%VENV%\Scripts\python.exe" "%ROOT%\run.py"
