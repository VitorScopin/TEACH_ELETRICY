# Altus XP340 via OPC UA

O TEACH ELETRICY pode atuar como cliente OPC UA para testar o laboratório do semáforo com um CLP Altus Nexto Xpress, como o XP340.

## 1. Variáveis sugeridas no MasterTool

Crie uma GVL chamada `GVL_Semaforo`:

```iecst
VAR_GLOBAL
    OESTE_VERMELHO  : BOOL;
    OESTE_AMARELO   : BOOL;
    OESTE_VERDE     : BOOL;

    LESTE_VERMELHO  : BOOL;
    LESTE_AMARELO   : BOOL;
    LESTE_VERDE     : BOOL;

    NORTE_VERMELHO  : BOOL;
    NORTE_AMARELO   : BOOL;
    NORTE_VERDE     : BOOL;

    SUL_VERMELHO    : BOOL;
    SUL_AMARELO     : BOOL;
    SUL_VERDE       : BOOL;
END_VAR
```

Essas variáveis podem ser acionadas pela lógica Ladder/ST do exercício.

## 2. Publicar as variáveis no OPC UA

No MasterTool IEC XE:

1. Clique com o botão direito em `Application`.
2. Adicione `Symbol Configuration`.
3. Ative o suporte a OPC UA.
4. Compile o projeto.
5. Marque a `GVL_Semaforo` e as 12 variáveis para publicação.
6. Compile novamente e faça download da aplicação para o XP340.

## 3. Configuração OPC do XP340

Abra `Comunicação > Configuração OPC`.

Para um teste simples em rede local:

- Endereço ativo: IP do XP340.
- Gateway: IP do XP340.
- Porta do gateway OPC UA: `4840`.
- Habilite o uso do gateway no CP quando aplicável à versão do MasterTool/firmware.
- Para o primeiro teste, configure o servidor para aceitar uma conexão sem criptografia, se a política de segurança do projeto permitir.

Depois faça login/download e coloque a aplicação em RUN.

## 4. Configuração no TEACH ELETRICY

Abra o cartão `CONEXÃO INDUSTRIAL` e selecione:

`Altus OPC UA`

Endpoint de exemplo:

```text
opc.tcp://192.168.15.1:4840
```

Para o primeiro teste:

- Security Mode: `None`
- Security Policy: `None`
- Usuário/Senha: deixe em branco caso o servidor permita Anonymous.

## 5. NodeIds

O NodeId exato depende do projeto, nome do dispositivo, versão do runtime e namespace OPC UA.

O app vem com exemplos no formato:

```text
ns=4;s=|var|Application.GVL_Semaforo.OESTE_VERMELHO
```

Não assuma que `ns=4` será igual no seu XP340.

Use um cliente OPC UA (por exemplo UaExpert) para navegar até:

`Objects > DeviceSet > [seu XP340] > Resources > Application > Global Vars > GVL_Semaforo`

Copie o NodeId real de cada variável e cole no campo correspondente do TEACH ELETRICY.

## 6. Mapeamento esperado

| Semáforo | Vermelho | Amarelo | Verde |
|---|---|---|---|
| Oeste | OESTE_VERMELHO | OESTE_AMARELO | OESTE_VERDE |
| Leste | LESTE_VERMELHO | LESTE_AMARELO | LESTE_VERDE |
| Norte | NORTE_VERMELHO | NORTE_AMARELO | NORTE_VERDE |
| Sul | SUL_VERMELHO | SUL_AMARELO | SUL_VERDE |

O TEACH ELETRICY faz apenas leitura dessas 12 variáveis neste laboratório.

## 7. Diagnóstico rápido

Se conectar ao endpoint mas a leitura falhar:

- confirme se a GVL foi incluída no Symbol Configuration;
- confirme se a aplicação foi recompilada e baixada após alterar símbolos;
- confira os NodeIds reais no UaExpert;
- confira se o XP340 e o PC estão na mesma rede;
- teste `ping <IP_DO_XP340>`;
- confira a porta 4840;
- confirme Security Mode/Policy aceitos pelo servidor;
- para projetos com certificado, troque o app para `Sign` ou `SignAndEncrypt` e `Basic256Sha256`.

## Referências Altus

- Base de conhecimento Altus: configuração OPC UA do Nexto/XP340.
- Manual OPC UA Server for Altus Controllers (MU214609).
- Manual da família XP3xx.
