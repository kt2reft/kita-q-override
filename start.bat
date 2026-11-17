@echo off
rem KITA-Q OVERRIDE 起動用バッチ（ダブルクリックで起動）
cd /d "%~dp0"
start "" "http://localhost:5173/"
python server.py 5173
