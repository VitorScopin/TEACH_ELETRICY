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

## Gerar aplicativo para Windows

O projeto pode ser distribuído como um aplicativo desktop x64. O empacotamento gera:

- instalador Windows (NSIS), com atalho na Área de Trabalho e Menu Iniciar;
- executável portátil, que pode ser aberto sem instalação;
- bridges OPC DA x86 e x64 self-contained dentro do pacote.

### Requisitos apenas para quem gera o instalador

- Windows 10/11 x64;
- Node.js 22+;
- npm;
- .NET SDK 8, usado somente para compilar as bridges OPC DA.

Quem recebe o aplicativo pronto **não precisa instalar Node.js, npm ou o .NET SDK**.

Depois de clonar/atualizar o projeto:

```bat
npm install
npm run dist:windows
```

Os arquivos de distribuição ficam em:

```text
release\
```

Também é possível gerar separadamente:

```bat
npm run dist:installer
npm run dist:portable
```

O GitHub Actions possui um workflow de empacotamento Windows que gera os executáveis automaticamente e publica os arquivos como artifacts do workflow.

> Os executáveis ainda não possuem assinatura digital de Code Signing. Em outra máquina, o Windows SmartScreen pode exibir um aviso de editor desconhecido. Isso não impede a instalação, mas para uma distribuição comercial é recomendado assinar o instalador e o executável.

### Dados do usuário

Configurações e o snapshot do projeto não são gravados dentro da pasta de instalação. O Electron utiliza a pasta `userData` do Windows e salva o arquivo `teach-project.json` lá. Assim, atualizar/reinstalar o aplicativo não depende de escrever dentro de `Program Files`.

### OPC DA em outro computador

As bridges x86/x64 vão dentro do aplicativo. Porém, o servidor OPC DA utilizado pela instalação industrial ainda precisa estar corretamente instalado/registrado no computador de destino, pois OPC DA depende do ambiente COM/DCOM do Windows.

---

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
