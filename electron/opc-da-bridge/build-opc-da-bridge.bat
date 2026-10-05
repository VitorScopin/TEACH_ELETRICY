@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "PROJECT=%ROOT%TeachOpcDaBridge\TeachOpcDaBridge.csproj"

if not exist "%PROJECT%" (
  echo ERRO: projeto C# nao encontrado: %PROJECT%
  exit /b 1
)

where dotnet >nul 2>&1
if errorlevel 1 (
  echo ERRO: .NET SDK 8 nao encontrado.
  exit /b 1
)

echo Compilando bridge OPC DA x86...
dotnet publish "%PROJECT%" -c Release -r win-x86 --self-contained true -p:PlatformTarget=x86 -p:AssemblyName=opc-da-bridge-x86 -o "%ROOT%publish\x86"
if errorlevel 1 exit /b 1
copy /Y "%ROOT%publish\x86\opc-da-bridge-x86.exe" "%ROOT%opc-da-bridge-x86.exe" >nul

echo Compilando bridge OPC DA x64...
dotnet publish "%PROJECT%" -c Release -r win-x64 --self-contained true -p:PlatformTarget=x64 -p:AssemblyName=opc-da-bridge-x64 -o "%ROOT%publish\x64"
if errorlevel 1 exit /b 1
copy /Y "%ROOT%publish\x64\opc-da-bridge-x64.exe" "%ROOT%opc-da-bridge-x64.exe" >nul

echo.
echo Bridges criados:
echo %ROOT%opc-da-bridge-x86.exe
echo %ROOT%opc-da-bridge-x64.exe
endlocal
