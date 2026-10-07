# Melting · Gestão de Contratos

Sistema interno da Melting para gestão de contratos, cotações, clientes e
planilhas — Fase 1 (piloto).

## Estrutura do projeto

```
melting-gestao-contratos/
├── index.html          → sistema principal
├── login.html           → tela de login
├── css/
│   ├── styles.css       → estilos do sistema
│   └── login.css        → estilos do login
├── js/
│   ├── app.js            → lógica do sistema (dados, filtros, régua, permissões, etc.)
│   ├── login.js           → lógica do login
│   ├── supabase-client.js → configuração de conexão com o Supabase
│   ├── parametros.js      → limites dos KPIs, régua, motor e IA (tela Parâmetros)
│   ├── motor.js           → motor de resposta: sugere o ID Melting de cada item
│   ├── kpis.js            → consumo real × estimado, ritmo, fora do contrato
│   └── inteligencia.js    → telas Responder planilha, Base de dados, Parâmetros,
│                            itens do contrato e KPIs do Dashboard
├── assets/               → logos e imagens
└── supabase/              → scripts SQL (tabelas, permissões e colunas do banco)
    ├── schema.sql
    ├── perfis-e-permissoes.sql
    ├── colunas-adicionais.sql
    ├── inteligencia.sql   → tabelas do motor, consumo e parâmetros
    └── functions/responder-itens/index.ts → IA (Claude) para itens difíceis
```

## Como rodar localmente

Não precisa de servidor nem instalação — é só abrir o `login.html` direto
no navegador.

## Configurar o Supabase

1. No [supabase.com](https://supabase.com), crie um projeto (ou use um já existente).
2. No **SQL Editor**, rode os três scripts da pasta `supabase/`, nesta ordem:
   `schema.sql` → `perfis-e-permissoes.sql` → `colunas-adicionais.sql`.
3. Em `js/supabase-client.js`, preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY`
   com os dados do seu projeto (**Project Settings → API**).
4. Crie os usuários em **Authentication → Users**. O primeiro usuário nasce
   como `gerente` (somente leitura); para virar `admin` (acesso total), rode
   no SQL Editor:
   ```sql
   update public.perfis set papel = 'admin' where email = 'seu-email@melting.com.br';
   ```

## Permissões

- **admin** — acesso total (cria, edita e exclui contratos, cotações e clientes).
- **gerente** — acesso somente leitura (dashboard, contratos, cotações,
  planilhas e clientes), sem os botões de cadastro/edição/exclusão.

As regras são aplicadas tanto na interface quanto no banco (Row Level
Security), então mesmo sem os botões visíveis, o banco recusa qualquer
escrita de quem não é admin.


---

## Módulo de inteligência (motor de resposta, consumo real, KPIs)

### 1. Banco (uma vez)

No **SQL Editor** do Supabase, rode `supabase/inteligencia.sql` (depois dos
outros scripts). Ele cria:

| Tabela | Para quê |
|---|---|
| `produtos` | cadastro Melting (exportação **cad_produtos** do SIG) |
| `vendas` | histórico de pedidos (exportação **relsitped** do SIG) |
| `contrato_itens` | cada linha da planilha do cliente, já respondida |
| `de_para` | código do cliente → ID Melting aprovado (a "memória" do motor) |
| `parametros` | limites da tela Parâmetros |

Também cria o campo `contratos.codigos_cliente` ("Cliente no SIG"), o bucket
de armazenamento `motor` e duas visões para o Power BI
(`vw_consumo_item` e `vw_fora_do_contrato`). Mesma regra de acesso do resto:
todo mundo logado lê, só admin grava.

### 2. Alimentar a base (menu **Base de dados**)

1. **Cadastro de produtos**: arraste todos os `cad_produtos_*.xls` de uma vez.
   O sistema grava na tabela e gera o arquivo compactado do catálogo que cada
   navegador baixa uma vez (o motor roda no próprio navegador, sem custo).
   Repita sempre que o cadastro mudar.
2. **Histórico de vendas**: arraste o `relsitped.xls`. Pode reimportar à
   vontade: não duplica.
3. **Ensinar com planilhas já respondidas**: suba contratos antigos que já têm
   o código do cliente e o ID Melting. Vira de-para: esses códigos voltam com o
   ID certo nas próximas planilhas do mesmo cliente.

### 3. Responder uma planilha (menu **Responder planilha**)

1. Suba a planilha do cliente (qualquer layout). O sistema acha o cabeçalho e
   as colunas; confira e escolha o contrato de destino.
2. **Responder com o motor**. Cada item vem com ID sugerido, confiança e o
   motivo:
   - **Alta**: de-para do cliente, mesmo código já vendido no SIG, ou REF igual
     ao apelido do cadastro.
   - **Média**: equivalente ao REF no cadastro ou montado pela regra de
     terminal/adaptador (`6G6FJX90SML`, `12MJ12MBSPP`...).
   - **Baixa**: padrão aprendido de item parecido. Conferir.
   - **Sem cadastro**: nada seguro. Clique no lápis para ver as opções que o
     motor considerou ou buscar no cadastro.
   Toda sugestão por semelhança passa por travas de material, padrão de rosca,
   tipo de peça, medidas, marca e diâmetro de tubo.
3. Aprove (um a um ou "Aprovar todas de confiança alta"), depois
   **Baixar planilha respondida** (a planilha original com as colunas da
   Melting no fim, mais a aba "Não encontrados") e/ou **Salvar no contrato**.
   Itens aprovados entram no de-para do cliente.

> A planilha baixada mantém os valores e fórmulas, mas não a formatação
> (cores, bordas) do arquivo original.

**Teste com a planilha da Arcelor** (1.240 itens, usando o REF do Kayan):
o motor respondeu 664 itens em ~20 s; nos itens que já tinham ID, acertou
96,8%. Sem REF e sem histórico, a descrição SAP sozinha não basta: é aí que
entra o de-para (na renovação) e a IA.

### 4. Consumo real e KPIs

No contrato, preencha **Cliente no SIG**: o nome fantasia como aparece no
relsitped (ex.: `TRIVIUM PACKAGING`) e/ou o código do cliente, separados por
vírgula. Ao responder uma planilha, o sistema sugere esse vínculo sozinho
("Ligar ao contrato").

- **No contrato**: valor estimado × consumido, % do tempo decorrido, ritmo
  (consumo ÷ tempo), previsão de esgotamento, compras fora do contrato, itens
  sem giro, preço praticado × contratado, itens sem cadastro.
- **No Dashboard**: consumido × contratado da carteira, ritmo médio, compras
  fora do contrato, itens sem giro, conversão de cotações, tempo médio de
  resposta, cobertura das cotações e valor perdido. Também mostra os contratos
  fora do ritmo e as maiores compras fora do contrato.
- **Parâmetros** (admin): data de referência, limites de consumo, régua de
  dias, faixa de ritmo, % de vigência para "sem giro", % de divergência de
  preço, notas mínimas e travas do motor, IA ligada/desligada.

### 5. IA (opcional): Claude para os itens difíceis

O motor local resolve o que tem REF, de-para ou histórico. Para os itens
"sem cadastro" ou de confiança baixa, o botão **Pedir à IA** manda a descrição
para a função `responder-itens`. A IA escreve buscas no jeito Melting, o
sistema procura no catálogo e a IA escolhe um candidato, ou sugere como
cadastrar. Toda escolha da IA ainda passa pelas travas e entra como
"conferir".

Para publicar (precisa da [CLI do Supabase](https://supabase.com/docs/guides/cli)
e de uma chave da API da Anthropic, que é cobrada por uso):

```bash
supabase login
supabase link --project-ref rbarvmaiagdnniefeooo
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy responder-itens
```

Depois ligue em **Parâmetros → IA → Usar IA para itens sem resposta**. A chave
fica só no servidor do Supabase e nunca vai para o navegador.
