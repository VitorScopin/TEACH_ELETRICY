# TEACH_ELETRICY

Laboratório desktop para aprender programação de PLC com projetos interativos, comunicação com controladores Siemens e simulações visuais.

## Objetivo

O aluno programa o PLC no TIA Portal e usa o TEACH_ELETRICY para visualizar o comportamento da lógica em uma simulação. O aplicativo também oferece um modo de simulação local para estudar sem hardware.

## Primeiro laboratório

**Projeto 01 — Semáforo inteligente**

- Semáforo vermelho, amarelo e verde.
- Carros animados reagindo ao estado das saídas.
- Modo Simulação e modo PLC.
- Comunicação Siemens S7 via Ethernet.
- Configuração de IP, rack, slot e tags.
- Diagnóstico de conexão.
- Guia de lógica para implementação no TIA Portal.

## Arquitetura planejada

- React + TypeScript + Vite
- Electron para aplicativo desktop
- IPC seguro entre interface e processo principal
- Driver Siemens S7 isolado no processo principal
- Projetos didáticos independentes e escaláveis

> Estado atual: estrutura inicial em desenvolvimento.
