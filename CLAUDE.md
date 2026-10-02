# Melting · Gestão de Contratos — contexto para o Claude Code

Sistema interno da Melting (Soluções em Manutenção Industrial) para gestão de
contratos, cotações e resposta automática de planilhas de clientes. Site
estático (HTML/CSS/JS puro, sem build) + Supabase (Auth, Postgres, Storage,
Edge Function). Idioma da interface, do código e dos comentários: português.

## Estrutura
- `index.html`, `login.html` — telas. Sem framework; scripts clássicos (não-module).
- Ordem dos scripts importa: `supabase-client.js` → `parametros.js` → `motor.js` → `kpis.js` → `app.js` → `inteligencia.js`.
- `js/app.js` — código original do sistema (contratos, cotações, clientes, régua, permissões). Mudanças nele foram mínimas: ganchos `Intel.*`, `PARAMS` no lugar de números fixos, `HOJE = dataReferencia()`, campo `codigos_cliente`.
- `js/parametros.js` — `PARAMS_PADRAO`, `PARAMS` (cache em localStorage, fonte da verdade na tabela `parametros`), `bucketsRegua()`.
- `js/motor.js` — motor de resposta (sem dependências; roda no navegador e no Node). Exporta `Motor`.
- `js/kpis.js` — cálculo puro de consumo real × estimado, ritmo, fora do contrato, KPIs de cotações. Exporta `Kpis`.
- `js/inteligencia.js` — telas Responder planilha, Base de dados, Parâmetros, painel de itens no detalhe do contrato e KPIs extras do Dashboard. Exporta `Intel`.
- `supabase/*.sql` — rodar na ordem: schema → perfis-e-permissoes → colunas-adicionais → data-recebimento-contratos → inteligencia.
- `supabase/functions/responder-itens/index.ts` — Edge Function (Deno) que chama a API do Claude em dois passos (`consultas` e `escolher`). Segredo `ANTHROPIC_API_KEY`; modelo em `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`).
- `dev/testes/` — testes (ver abaixo). `dev/dados/` fica fora do git.

## Regras do banco
- RLS: leitura para qualquer usuário autenticado; escrita só `public.is_admin()` (papéis `admin` / `gerente` em `perfis`).
- Tabelas novas: `produtos`, `vendas`, `contrato_itens`, `de_para`, `parametros`; coluna `contratos.codigos_cliente`; bucket `motor` (arquivo `catalogo.json.gz`); visões `vw_consumo_item`, `vw_fora_do_contrato`; função `venda_do_contrato(lista, codigo, nome)`.
- Supabase pagina em 1000 linhas: sempre usar `selectAll()` em `inteligencia.js`.
- O banco ao vivo tem colunas que não estão nos .sql do repositório (ex.: `itens_cotados`, `valor_cotado`, `periodo`, `situacao`, tabelas `cotacao_itens` e `auditoria`). Não remover.

## Dados do SIG (ERP da Melting) — pegadinhas
- `cad_produtos_*.xls`: exportação em vários arquivos por origem. Colunas-chave: `Produto` (ID), `Descrição`, `Complemento` (= APELIDO Melting, às vezes com aspas sobrando), `Situação` (A/I), `Descr. (Origem)`, `Descr. (Família)`, `UM`, `% IPI`. ~110 mil produtos, incluindo IDs `FTM*...` (mangueiras montadas). SheetJS lê esses .xls (avisa "Missing Info for XLS Record 0x27d" — ignorar); o xlrd do Python não lê.
- `relsitped.xls` (histórico de pedidos): `pedido_id`, `fantasia` (nome do cliente), `descricao`, `databreped` (data serial do Excel), `qtd`, `preuni`, `sitped`, `numcli`, `refere`, `idproduto`. **`numcli` muda a cada pedido — não é código do cliente.** O vínculo venda→contrato é pelo nome fantasia (campo "Cliente no SIG" aceita nomes e/ou códigos separados por vírgula). `refere` = código do item no cliente (usado pelo motor no histórico).
- `relpro_ftm.xls` / `theo.xls`: base de mangueiras montadas (FTM: mangueira + terminais + capa + acessórios). O usuário quer que as respostas usem os **IDs gerais do cadastro**; FTM serve só de referência.

## Motor de resposta (`js/motor.js`)
Ordem: 1) de-para do cliente → 2) histórico de vendas pelo código do item → 3) REF = apelido idêntico → 4) regras de terminal/adaptador hidráulico → 4b) sem REF: `refSintetico()` monta o REF pela descrição SAP (conexões de tubo Ermeto/DIN: prefixo Ermeto + tubo + série L/S + rosca; conexões galvanizadas Tupy) → 4c) correias: `parseCorreia()` lê perfil + comprimento + largura/canais/bandas (sincronizadora, TP, micro-V, V, power band, Polyflex) no cliente e no cadastro; casa pela mesma chave, preferindo a marca pedida; sem a largura pedida devolve as larguras vizinhas como alternativas → 5) equivalente ao REF por similaridade (tf-idf de trigramas/quadrigramas) → 6) padrão aprendido (troca de bitola) → 7) descrição (desligado por padrão).
Toda sugestão por semelhança passa por `travas()`: material (inox exige candidato inox; latão; PVC), padrão de rosca (NPT ≠ BSP ≠ UNF; JIC/ORFS = grupo UNF), tipo de peça, medidas do REF, número de pontas, prefixo e diâmetro de conexão de tubo (UMI/UMA/JMI…, `C`+prefixo = só corpo), macho/fêmea, marca, código camlock (AE/CI…). "PA+AA" no REF é porca+anel do próprio item, não kit.
Convenções de apelido: terminal `{dashMangueira}G{dashRosca}{TIPO}[45|90]SML` (FJX, FFORX, FBSPORX, FDLORX/FDHORX, MP, MBSPP, MJ, MLSP, FL/FLH, FP); adaptador `{dash}{TIPO}{dash}{TIPO}[ângulo]` (ex.: 12MJ12MBSPP).
Referência de qualidade (Arcelor, itens com ID já preenchido pelo Kayan, usando o REF dele): 87% respondidos, **96,8% de acerto**; sem REF a descrição SAP sozinha não resolve (por isso de-para + IA). Rodar `dev/testes/benchmark_motor.js` antes e depois de mexer nas travas.

## Testes
- Regras sem REF: `node dev/testes/benchmark_sem_ref.js` (só precisa do `dev/dados/arc.json`; catálogo de teste = REFs do Kayan). Referência: 95 itens sugeridos sem REF, 85 certos (89,5%); os erros restantes são quase todos itens que o Kayan cotou com código SGM.
- Correias: `node --max-old-space-size=4096 dev/testes/benchmark_correias.js ["descrição do cliente" ...]` (usa `dev/dados/cat.json`). Referência com o cadastro de correias de 23/09: 40.549 de 66.517 correias lidas (as não lidas são quase todas planas/transportadoras Nitta, Maxbelt, variadoras VDM); auto-teste 24.329 / 24.337.
- Motor: `node dev/testes/gerar_dados_teste.js <pasta com cad_produtos>` e depois `node --max-old-space-size=4096 dev/testes/benchmark_motor.js` (usa `dev/dados/arc.json`, gabarito da Arcelor).
- SQL: `npm i @electric-sql/pglite && node dev/testes/teste_sql.mjs` (roda todos os .sql com stubs de auth/storage e testa as visões). O erro em `colunas-adicionais.sql` com os dados de exemplo é pré-existente.
- Navegador: servir a pasta (`python3 -m http.server 8765`) e rodar `python3 dev/testes/teste_navegador.py` (Playwright; troca o supabase-js do CDN por `dev/testes/mock-supabase.js`, banco em memória). Precisa dos .xls do SIG e das planilhas da Arcelor/Trivium em `dev/testes/files/`.

## Histórico e decisões do usuário
- Planilhas de clientes respondidas até agora: Trivium (teste_cloude_1), Suzano (mangueiras, muito OEM), Arcelor (analise_arcelor_kayan). Cada cliente é independente — não misturar dados de um na resposta do outro.
- Para Habasit, usar similares Nitta (relpro_nita) só quando comprimento e largura batem e a descrição não pede furo, talisca ou acessório.
- Quando não achar, sinalizar "NÃO ENCONTRADO" e listar à parte, com descrição no padrão Melting e fornecedores prováveis (DSCF014 = cadastro de fornecedores).
- Existe uma demonstração publicada como Artifact (dados em memória, não grava).

## Próximos passos possíveis
- Publicar a Edge Function e medir a IA com itens reais sem REF.
- Regras para itens sem REF: conexões de tubo e Tupy já portadas (`refSintetico`); correias sincronizadoras/V/micro-V também (`parseCorreia`). Faltam mangueiras por construção/pressão, engates camlock (CI/AE…) e correias planas (Habasit → Nitta por comprimento × largura).
- Precificação da montagem (mangueira + terminais + capa + mão de obra, com impostos do item principal).
- Ligar o Power BI nas visões `vw_consumo_item` / `vw_fora_do_contrato`.
