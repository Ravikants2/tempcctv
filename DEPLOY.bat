@echo off
echo ============================================================
echo  iON CCTV - tempcctv GitHub Deploy Script
echo ============================================================
echo.

REM Check if git is installed
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Git is not installed.
    echo Download from: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/2] Confirming this folder targets the new repository...
git remote get-url origin | findstr /i "Ravikants2/tempcctv.git" >nul
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: This folder is not configured for Ravikants2/tempcctv.
    echo No changes were pushed.
    pause
    exit /b 1
)

echo.
echo [2/2] Pushing the current main branch...
git push -u origin main
IF %ERRORLEVEL% NEQ 0 (
    echo Push failed. No force push was attempted.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  DONE! No Cloudflare or API secrets are needed for this demo.
echo.
echo  Pages: https://github.com/Ravikants2/tempcctv/settings/pages
echo.
echo  Actions: https://github.com/Ravikants2/tempcctv/actions
echo.
echo  App URL: https://ravikants2.github.io/tempcctv/
echo  Original ion-cctv-app repository is not modified.
echo  Users need private-repository access and their own fine-grained GitHub token.
echo ============================================================
pause
