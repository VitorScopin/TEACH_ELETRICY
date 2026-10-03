# TEACH_ELETRICY

Laboratório desktop para aprender programação de PLC com projetos interativos, comunicação com controladores Siemens e simulações visuais.

## Projeto 01 — Semáforo inteligente

O primeiro laboratório ensina temporizadores, sequenciamento e mapeamento de I/O. O aluno pode testar tudo em modo virtual ou conectar um PLC Siemens real e ver os carros reagirem às três saídas do programa.

### Stack

- React + TypeScript + Vite
- Electron
- nodeS7 / Siemens S7 Ethernet (RFC1006)
- IPC isolado entre UI e driver do PLC

## Executar

Requisitos: Node.js 20+ e npm.

```bash
git clone https://github.com/VitorScopin/TEACH_ELETRICY.git
cd TEACH_ELETRICY
git checkout feature/semaforo-mvp
npm install
npm run dev
```

O modo **Simulação** funciona sem PLC.

## Conectar um PLC Siemens

Na tela do laboratório informe:

- IP do PLC
- Rack
- Slot
- Endereço da lâmpada vermelha
- Endereço da lâmpada amarela
- Endereço da lâmpada verde

Valores iniciais do laboratório:

| Função | Endereço |
| --- | --- |
| Vermelho | `M0.0` |
| Amarelo | `M0.1` |
| Verde | `M0.2` |

A comunicação utiliza TCP **porta 102**.

### S7-1200 / S7-1500

Para este método de leitura, configure o projeto no TIA Portal para permitir comunicação PUT/GET de parceiro remoto. Quando usar DB com endereçamento absoluto, utilize um DB compatível com esse tipo de acesso (não otimizado).

Para um S7-1200, normalmente use **Rack 0 / Slot 1**. Em famílias diferentes o slot pode mudar.

> Antes de escrever dados no PLC, valide a aplicação em bancada. O MVP atual somente lê os três sinais do semáforo.

## Exercício sugerido no TIA Portal

Crie uma sequência cíclica:

1. Vermelho ligado por 5 s.
2. Verde ligado por 6 s.
3. Amarelo ligado por 2 s.
4. Retorno ao estado vermelho.
5. Nunca permita duas lâmpadas ligadas simultaneamente.

Uma boa implementação é usar uma máquina de estados e temporizadores TON.

## Arquitetura

```text
TIA Portal / PLC Siemens
          │
          │ S7 Ethernet :102
          ▼
┌──────────────────────────────┐
│ Electron Main Process        │
│  Siemens S7 Driver           │
└──────────────┬───────────────┘
               │ IPC seguro
               ▼
┌──────────────────────────────┐
│ React UI                     │
│ Laboratório + Simulação      │
└──────────────────────────────┘
```

## Próximos laboratórios

A estrutura será evoluída para suportar projetos independentes, por exemplo:

- Partida direta de motor
- Reversão de motor
- Esteira com sensor e contador
- Reservatório com nível
- Elevador
- Portão automático
- Classificação de peças
- Estação pneumática
- Sequência de cilindros
- Controle PID de processo

Cada laboratório poderá ter objetivo, mapa de tags, explicação, desafio, simulação e validação automática.
