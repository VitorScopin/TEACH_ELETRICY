@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   TEACH ELETRICY - GERAR APP WINDOWS
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale o Node.js e tente novamente.
  pause
  exit /b 1
)

where dotnet >nul 2>nul
if errorlevel 1 (
  echo [ERRO] .NET SDK 8 nao encontrado.
  echo Ele e necessario para compilar a bridge OPC DA.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/4] Instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo [1/4] Dependencias ja instaladas.
)

echo [2/4] Compilando bridges OPC DA...
call npm run build:opcda
if errorlevel 1 goto :error

echo [3/4] Compilando aplicacao...
call npm run build
if errorlevel 1 goto :error

echo [4/4] Gerando instalador e versao portatil...
call npx electron-builder --win nsis portable --x64 --publish never
if errorlevel 1 goto :error

echo.
echo ==========================================
echo   APP GERADO COM SUCESSO
echo ==========================================
echo.
echo Os arquivos para enviar estao na pasta:
echo   %CD%\release
echo.
echo Recomendado:
echo   TEACH ELETRICY-Setup-0.2.0-x64.exe
echo.
echo Ou sem instalar:
echo   TEACH ELETRICY-Portable-0.2.0-x64.exe
echo.
explorer "%CD%\release"
pause
exit /b 0

:error
echo.
echo [ERRO] Nao foi possivel gerar o aplicativo.
echo Veja a mensagem acima para identificar a etapa que falhou.
pause
exit /b 1
