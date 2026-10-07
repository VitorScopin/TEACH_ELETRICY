@echo off
setlocal EnableExtensions
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

echo [PREPARACAO] Fechando instancia antiga do TEACH ELETRICY...
taskkill /F /IM TEACH-ELETRICY.exe >nul 2>nul

echo [PREPARACAO] Limpando saida antiga...
call :clean_release
if errorlevel 1 (
  echo.
  echo [ERRO] A pasta release continua bloqueada.
  echo Feche qualquer janela do Explorer aberta em release e qualquer instancia do TEACH ELETRICY.
  echo Se o Windows Defender estiver verificando a pasta, aguarde alguns segundos e rode novamente.
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

if not exist "electron\opc-da-bridge\publish\x64\opc-da-bridge-x64.exe" (
  echo [ERRO] Executavel OPC DA x64 nao foi publicado.
  goto :error
)
if not exist "electron\opc-da-bridge\publish\x64\opc-da-bridge-x64.dll" (
  echo [ERRO] DLL OPC DA x64 nao foi publicada.
  goto :error
)
if not exist "electron\opc-da-bridge\publish\x86\opc-da-bridge-x86.exe" (
  echo [ERRO] Executavel OPC DA x86 nao foi publicado.
  goto :error
)
if not exist "electron\opc-da-bridge\publish\x86\opc-da-bridge-x86.dll" (
  echo [ERRO] DLL OPC DA x86 nao foi publicada.
  goto :error
)

echo [OK] Bridges OPC DA completas: EXE + DLL + runtime.

echo [3/4] Compilando aplicacao...
call npm run build
if errorlevel 1 goto :error

echo [4/4] Gerando instalador e versao portatil...
call :build_release
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
echo   TEACH ELETRICY-Setup-0.2.1-x64.exe
echo.
echo Ou sem instalar:
echo   TEACH ELETRICY-Portable-0.2.1-x64.exe
echo.
explorer "%CD%\release"
pause
exit /b 0

:clean_release
for /L %%I in (1,1,6) do (
  if exist "release\win-unpacked.tmp" rmdir /s /q "release\win-unpacked.tmp" >nul 2>nul
  if exist "release\win-unpacked" rmdir /s /q "release\win-unpacked" >nul 2>nul

  if not exist "release\win-unpacked.tmp" if not exist "release\win-unpacked" (
    if exist "release" rmdir /s /q "release" >nul 2>nul
    if not exist "release" exit /b 0
  )

  echo   Aguardando o Windows liberar arquivos... tentativa %%I/6
  timeout /t 2 /nobreak >nul
)
if exist "release\win-unpacked.tmp" exit /b 1
if exist "release\win-unpacked" exit /b 1
if exist "release" (
  rmdir /s /q "release" >nul 2>nul
  if exist "release" exit /b 1
)
exit /b 0

:build_release
for /L %%I in (1,1,3) do (
  echo   Empacotamento tentativa %%I/3...
  call npx electron-builder --win nsis portable --x64 --publish never
  if not errorlevel 1 exit /b 0

  echo.
  echo   O Windows bloqueou algum arquivo durante o empacotamento.
  echo   Limpando temporarios para tentar novamente...
  taskkill /F /IM TEACH-ELETRICY.exe >nul 2>nul
  timeout /t 3 /nobreak >nul
  call :clean_release
  timeout /t 2 /nobreak >nul
)
exit /b 1

:error
echo.
echo [ERRO] Nao foi possivel gerar o aplicativo.
echo Veja a mensagem acima para identificar a etapa que falhou.
echo.
echo Se aparecer EPERM novamente:
echo   1. Feche a pasta release no Explorer.
echo   2. Feche qualquer TEACH ELETRICY aberto.
echo   3. Rode este arquivo novamente como Administrador.
pause
exit /b 1
