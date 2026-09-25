# Bot de Atendimento (n8n) — documentação técnica

Este diretório contém o export dos workflows do [n8n](https://n8n.io/) que implementam o bot de atendimento automatizado. É um sistema separado da API deste repositório (`api-treenity-bot`), rodando em uma instância própria do n8n — os dois se conectam apenas por compartilharem o **mesmo banco Postgres/Supabase**.

O canal em produção hoje é o **Facebook (Messenger + comentários)**. A seção final compara com o que muda para o **WhatsApp**.

---

## Diagrama de fluxo

```
Cliente manda mensagem no Facebook
        │
        ▼
[Webhook] Facebook
        │
        ├── comentário em post ─► classifica sentimento (IA) ─► responde/chama no Direct
        │
        └── mensagem direta (texto ou áudio)
                │
                ▼
        upsert cliente → garante 1 atendimento aberto → grava mensagem do cliente
                │
                ▼
        [Sub-Fluxo] Agente de IA
                │
                ├─► consultar_produtos      → [Fluxo Busca] Planilha
                ├─► calcular_frete_cliente  → [API Externa] Cotar Frete
                └─► fechar pedido           → [Ação] Atualizar Pedido Planilha
                                                     ├─► e-mail (SMTP)
                                                     └─► [Sub-Fluxo] Avaliação de IA
                │
                ▼
        responde ao cliente no Facebook (texto ou áudio)
```

Os workflows menores são **sub-workflows**, chamados pelo Agente de IA como *tools* (function-calling do LangChain) ou encadeados diretamente.

---

## Workflows — entradas, saídas e efeitos colaterais

### `[Webhook] | Facebook`
Ponto de entrada público. Recebe eventos do Meta em dois formatos, roteados por um `Switch`.

- **Gatilho**: HTTP webhook, path `facebook-chat`. `GET` para verificação do Meta, `POST` para eventos.
- **Entrada (verificação)**: query params `hub.mode`, `hub.challenge`, `hub.verify_token`.
- **Entrada (evento de mensagem)**: body no formato Messenger — `entry[0].messaging[0]`, contendo `sender.id`, `message.text` ou `message.attachments` (áudio), `timestamp`. Descarta eventos de eco, entrega (`delivery`) e leitura (`read`).
- **Entrada (evento de comentário)**: body no formato de comentário — `entry[0].changes[0].value` com `item: "comment"`, `verb: "add"`, `message`, `comment_id`, `from.name`.
- **Saída HTTP**: responde `hub.challenge` (texto puro) na verificação; `"OK"` nos eventos de mensagem processados.
- **Efeitos colaterais (mensagem direta)**:
  - Se o anexo for áudio: baixa o arquivo da URL fornecida pelo Facebook e transcreve via **Google Gemini** (`gemini-2.5-flash`) — o texto transcrito substitui `mensagem_cliente`.
  - `UPSERT` em `clientes` por `id_face` (chamada REST direta ao Supabase, `on_conflict=id_face`).
  - Garante no máximo um `atendimentos` aberto por cliente: só insere um novo se não existir nenhum com `status_funil != 'Fechada'` para aquele `cliente_id`; caso já exista, reaproveita.
  - `INSERT` em `mensagens` (`remetente = 'cliente'`).
  - Chama `[Sub-Fluxo] | Agente de IA` com `{ sender_id, mensagem_cliente }`.
- **Efeitos colaterais (comentário)**:
  - Chama um `AI Agent` (Groq, `llama-3.3-70b-versatile`) que classifica o texto do comentário em `INTERESSE`, `NEUTRO` ou `NEGATIVO`.
  - `INTERESSE`: envia mensagem privada ao autor do comentário (Graph API, `recipient.comment_id`) e responde publicamente ao comentário.
  - `NEUTRO`: responde publicamente com um agradecimento.
  - `NEGATIVO`: nenhuma chamada é feita.

### `[Sub-Fluxo] | Agente de IA`
O agente conversacional. Contém a lógica de vendas e decide quando acionar as demais ferramentas.

- **Gatilho**: chamado como sub-workflow (`executeWorkflowTrigger`).
- **Entrada**: `sender_id` (string, id do cliente no canal), `mensagem_cliente` (string).
- **Saída**: não retorna dado estruturado ao chamador — o próprio workflow envia a resposta final ao cliente antes de terminar.
- **Memória de conversa**: LangChain `Postgres Chat Memory`, com `sessionKey = sender_id`. É uma tabela própria do LangChain, separada de `mensagens`.
- **Ferramentas conectadas** (cada uma é uma chamada a outro workflow, descrito abaixo):
  - `consultar_produtos` — parâmetro `termo_busca` (string).
  - `calcular_frete_cliente` — parâmetros `cep_destino`, `valor_carrinho`, `itens_pacote` (string).
  - Fechamento de pedido — parâmetros `id_face`, `itens_pedido`, `valor_produtos`, `transportadora`, `valor_frete`, `valor_total`, `status_venda`, `cep_cliente`, `nome_cliente`.
- **Decisão de formato de resposta**: se a saída do modelo começar com a tag `[AUDIO]`, o texto (sem a tag) é enviado à **Azure Speech** (TTS, voz `pt-BR-AntonioNeural`) e o áudio resultante é enviado ao cliente como anexo de áudio; caso contrário, o texto é enviado direto via Graph API.
- **Efeitos colaterais**: `INSERT` em `mensagens` (`remetente = 'ia'`) com a resposta enviada, em ambos os casos (texto ou áudio).

### `[Fluxo Busca] | Planilha`
Busca no catálogo de produtos.

- **Gatilho**: chamado como tool pelo Agente de IA.
- **Entrada**: `termo_busca` (string) — palavra-chave normalizada, ou a palavra `"catalogo"` para listagem geral.
- **Fonte de dados**: planilha Google Sheets ("produtos"), lida via nó `googleSheets` — **não é uma tabela do Postgres**.
- **Saída**: `{ produtos_encontrados: [...], instrucao_para_ia: string, erro: string, status: "ok" }`. Cada produto: `sku`, `nome`, `preco`, `descricao`, `peso`, `altura`, `largura`, `comprimento`.
- **Regra de busca**: substring (normalizada, sem acento/caixa) em nome e descrição; limite de 3 resultados para busca específica, 5 para catálogo geral (quando `termo_busca` é vazio ou uma das palavras genéricas `catalogo/geral/tudo`).
- **Efeitos colaterais**: nenhum (somente leitura).

### `[API Externa] | Cotar Frete`
Cotação de frete e aplicação de regra de frete grátis.

- **Gatilho**: chamado como tool pelo Agente de IA.
- **Entrada**: `cep_destino` (string), `valor_carrinho` (number), `itens_pacote` (string JSON — array de `{Weight, Height, Width, Length, Quantity}`), `id_face` (string).
- **Saída**: `{ instrucao_para_ia: string }` — texto já formatado com as opções de frete (ou aviso de frete grátis, ou aviso de que nenhuma transportadora atende o pacote).
- **Lógica**:
  - Consulta a **ViaCEP** para obter a UF do `cep_destino`.
  - Frete grátis se a UF estiver em uma lista fixa (`PR, SC, RS, SP, RJ, MG, ES, MS, MT, GO, DF`) **e** `valor_carrinho >= 900`; nesse caso, a **Frenet** não é chamada.
  - Caso contrário, monta o payload da **Frenet** (CEP de origem fixo) e cota o frete; filtra transportadoras com erro e formata a(s) opção(ões) restante(s).
- **Efeitos colaterais**: `UPDATE` em `atendimentos.status_funil = 'Proposta enviada'` para o atendimento aberto daquele cliente (roda em paralelo à cotação, não depende do resultado dela).

### `[Ação] | Atualizar Pedido Planilha`
Fecha o pedido no banco e aciona o pós-venda. (Nome herdado de uma versão anterior baseada em planilha; a implementação atual grava direto no Postgres.)

- **Gatilho**: chamado como tool pelo Agente de IA.
- **Entrada**: `id_face`, `itens_pedido`, `valor_produtos`, `transportadora`, `valor_frete`, `valor_total`, `status_venda`, `cep_cliente`, `nome_cliente` (todas string).
- **Saída**: `{ response: "Venda registrada com sucesso no banco de dados." }`.
- **Efeitos colaterais** (uma única transação SQL):
  1. `UPDATE clientes` — `cep_padrao`, `nome`.
  2. `UPDATE atendimentos` — fecha o atendimento aberto (`status_funil = 'Fechada'`).
  3. `INSERT INTO vendas` — vinculado ao `atendimento_id` fechado no passo anterior.
  - Envia e-mail via SMTP com o resumo do pedido (cliente, itens, transportadora, frete, total).
  - Chama `[Sub-Fluxo] | Avaliação de IA` com `{ id_face }` (não aguarda o retorno — `waitForSubWorkflow: false`).

### `[Sub-Fluxo] | Avaliação de IA`
QA automático do atendimento que acabou de fechar.

- **Gatilho**: chamado por `[Ação] | Atualizar Pedido Planilha`.
- **Entrada**: `id_face` (string).
- **Saída**: não retorna dado ao chamador (efeito é só a escrita no banco).
- **Lógica**: monta a transcrição completa (`STRING_AGG` de `mensagens`, ordenada por horário) do atendimento mais recente daquele cliente, envia a um LLM (Groq, `openai/gpt-oss-20b`) com um gabarito fixo (pediu CEP? cotou frete antes do total? guiou para pagamento?), e recebe um JSON estruturado.
- **Efeitos colaterais**: `UPDATE atendimentos` com `nota_feedback` (int), `categoria_feedback` (`Excelente`/`Mediano`/`Ruim`), `qualidade_ia` (numeric), `insights_ia` (jsonb com `pontos_positivos`/`pontos_melhoria`).

---

## Sinalização de atendimento sensível

> O lado da API (`api-treenity-bot`) já está implementado — ver abaixo. As mudanças nos fluxos do n8n descritas nesta seção ainda precisam ser feitas na instância do n8n.

Objetivo: quando o cliente insiste em desconto, reclama de preço ou demonstra estar muito insatisfeito, o Agente de IA deve **parar de responder automaticamente** e sinalizar o atendimento para um humano assumir — com aviso em tempo real no painel (deskcomm), não só um campo visível na próxima consulta.

A tag em si (estado gravado no banco) não precisa de rota nova — o n8n já escreve direto no Postgres para tudo o resto. A rota nova é necessária pela **outra metade do requisito**: o aviso em tempo real. Só a API deste repositório mantém as conexões Socket.io abertas com o painel; o n8n não tem como "empurrar" um evento para quem está com a tela aberta sem chamar essa API. Por isso a integração é: **n8n faz uma única chamada HTTP para a API, que persiste o estado E dispara o evento em tempo real** — evita duplicar a lógica de gravação em dois lugares (SQL no n8n + SQL na API).

### Mudanças necessárias nos fluxos existentes

**1. Nova ferramenta no Agente de IA** (`[Sub-Fluxo] | Agente de IA`)

Uma tool nova, no mesmo padrão das já existentes (`consultar_produtos`, `calcular_frete_cliente`), chamando um `HTTP Request` para a API deste repositório em vez de outro sub-workflow:

- Nome sugerido: `sinalizar_atendimento_humano`
- Descrição da tool (para o modelo decidir quando chamar): "Use esta ferramenta imediatamente quando o cliente insistir repetidamente em desconto após você já ter recusado educadamente, reclamar do preço de forma incisiva, ou demonstrar estar muito irritado/insatisfeito. Após chamar esta ferramenta, informe ao cliente que um atendente vai continuar a conversa e não tente mais negociar ou vender."
- Parâmetros: `id_face` (igual às outras tools) e `motivo` (texto curto gerado pelo modelo, ex: "Cliente pediu desconto 3x e ficou irritado com a recusa").
- Chamada: `POST` para `{{API_BASE}}/api/atendimentos/sinalizar`, header `X-N8N-Secret: <segredo>`, body `{ "id_face": "...", "motivo": "..." }`.

**2. Ajuste no system prompt** (`AI Agent` e `AI Agent1`, os dois — ver observação sobre duplicação)

Adicionar uma regra explícita, com prioridade sobre o funil normal: "Se o cliente pedir desconto mais de uma vez ou demonstrar irritação clara, NÃO continue a negociação — acione a ferramenta `sinalizar_atendimento_humano` e envie uma única mensagem avisando que um atendente vai assumir. Não envie mais nenhuma mensagem de venda depois disso."

**3. Gate antes de chamar o Agente de IA** (`[Webhook] | Facebook`)

Hoje o fluxo sempre chama `[Sub-Fluxo] | Agente de IA` depois de gravar a mensagem do cliente. Precisa entrar uma checagem antes dessa chamada: consultar se o `atendimentos` **aberto** daquele cliente (`status_funil != 'Fechada'`) já está sinalizado e, se estiver, **pular a chamada ao Agente de IA** — a mensagem do cliente continua sendo gravada em `mensagens` (para o humano ver o histórico completo no painel), só não gera resposta automática.

Isso é um `IF` novo entre a query que abre/reaproveita o `atendimentos` e o nó `Chama o Agente`.

### Retomada automática — reaproveitando o `status_funil` existente

Em vez de criar um estado novo de "resolvido", a retomada usa exatamente a mesma regra que já existe hoje para abrir um atendimento novo: **a IA só volta a atender aquele cliente quando o atendimento sinalizado for fechado** (`status_funil = 'Fechada'`). Isso já acontece sozinho em dois casos:

1. **Terminou em venda** — `[Ação] | Atualizar Pedido Planilha` já fecha o atendimento normalmente; nada muda aqui.
2. **Humano resolveu sem venda** — precisa de uma ação manual pelo painel pra fechar aquele atendimento (não existe hoje, porque hoje só a venda fecha um atendimento).

Assim que o atendimento sinalizado estiver `'Fechada'`, a próxima mensagem daquele cliente cria um `atendimentos` novo (a regra "um atendimento aberto por vez" já garante isso) — e esse novo atendimento nasce sem a sinalização, então o Agente de IA volta a responder normalmente, sem precisar de nenhuma lógica extra no n8n.

### Do lado da API (já implementado)

- Colunas novas em `atendimentos`: `precisa_atencao_humana` (boolean), `motivo_atencao` (texto), `atencao_sinalizada_em` (timestamp).
- `POST /api/atendimentos/sinalizar` — é exatamente a chamada que a tool do item 1 deve fazer. Header `X-N8N-Secret` (variável `N8N_SHARED_SECRET` no `.env` da API). Body `{ id_face, motivo }`. Acha o atendimento **aberto** daquele cliente, grava a sinalização e emite o evento `atendimento_sinalizado` no namespace `/chat` do Socket.io — é isso que avisa o painel em tempo real. Responde 404 se o cliente não tiver nenhum atendimento aberto.
- `POST /api/atendimentos/:id/encerrar` — rota para o painel (usuário autenticado, não n8n) fechar manualmente um atendimento sinalizado que não terminou em venda. É a ação descrita no item 2 da retomada automática.
- `GET /api/atendimentos/sinalizados` e `GET /api/atendimentos/:id/mensagens` — leitura para o painel (não usadas pelo n8n): a lista de atendimentos precisando de atenção agora, e a transcrição completa de um atendimento específico. É o que torna o alerta acionável — sem isso, o `atendimentoId` do evento em tempo real não levaria a lugar nenhum.

---

## Mídia (imagem/vídeo) não aparece na conversa espelhada (deskcomm)

> Levantado em 26/09/2026. Ao contrário da seção anterior, **esta mudança ainda
> não existe em lugar nenhum** — nem nesta API, nem (até onde os exports deste
> diretório mostram) no n8n. É só descrição do problema e do que precisa ser
> feito.

### O problema

A tela de transcrição do deskcomm (`/app/integrations/treenity-bot/[id]`) lê
`GET /api/atendimentos/:id/mensagens`, que devolve as linhas de `mensagens`
tal como estão no banco — incluindo a coluna `formato`. O front já sabe
diferenciar por `formato`; o que falta é o **dado** chegar lá.

Hoje, quando o Agente de IA manda um vídeo de identificação de praga pro
cliente (catálogo em `midias`, log em `midias_enviadas`), **nenhuma linha é
gravada em `mensagens`** pra esse envio. Confirmado direto no banco: existem
`0` mensagens com `formato = 'video'` ou `'imagem'` — só `'texto'`, `null` e
`'audio'`. A conversa mostrada no deskcomm tem literalmente um buraco onde o
vídeo foi enviado, porque o dado nunca existiu ali — não é a tela escondendo
algo que está no banco.

`midias_enviadas` também não ajuda a reconstruir isso depois: só guarda
`destinatario` (telefone) e `chave` (qual mídia), sem `atendimento_id` nem
`mensagem_id` — não dá pra juntar com segurança a um ponto exato da conversa
depois do fato.

Sobre os exports deste diretório: eles estão **desatualizados** em relação ao
que roda em produção nesse ponto específico — nenhum dos dois já procurei
(`[Sub-Fluxo] | Agente de IA.json`, `[Webhook] | Facebook.json`) menciona
`midias` ou seta a coluna `formato` nos `INSERT INTO mensagens` que eles têm.
Ou seja, o node/lógica que manda vídeo e grava em `midias_enviadas` foi
adicionado direto na instância do n8n em algum momento depois do último export
salvo aqui. Por isso o que segue é descritivo (o que precisa existir), não um
diff de um node específico — quem for aplicar precisa achar, na instância
real, o ponto onde a mídia é enviada (provavelmente logo antes ou depois do
`INSERT INTO midias_enviadas`).

### O que precisa mudar no n8n

**1. Junto do envio de vídeo/imagem** (onde hoje só grava em
`midias_enviadas`), adicionar um `INSERT INTO mensagens` igual ao que já
existe pra texto/áudio, só que com `formato` explícito e o **link da mídia**
no lugar do texto em `conteudo`:

```sql
INSERT INTO mensagens (atendimento_id, remetente, conteudo, formato)
SELECT id, 'ia', $2, $3
FROM atendimentos
WHERE cliente_id = (SELECT id FROM clientes WHERE id_face = $1 LIMIT 1)
  AND status_funil != 'Fechada'
LIMIT 1;
```
Com `$2` = `midias.url` da mídia que acabou de ser enviada (a mesma URL usada
pra mandar via Graph API) e `$3` = `midias.tipo` (hoje os valores existentes
lá são `'video'`/`'audio'`; use o mesmo valor de `tipo` como `formato`, pra
`imagem` ficar `'imagem'` se/quando existir esse tipo no catálogo). **Não
precisa de migração** — `conteudo` já é `text` livre, aceita uma URL do mesmo
jeito que aceita uma frase.

Mesmo padrão do INSERT de texto/áudio já existente (mesmo `WHERE`, resolvendo
o atendimento aberto pelo `id_face` do cliente) — só reaproveitar.

**2. Imagem enviada PELO cliente (sentido inverso)** — ao investigar achei um
gap relacionado, não perguntado mas que vale registrar: o node que lê o evento
do Facebook (`[Webhook] | Facebook`, no export local) só verifica
`attachment.type === 'audio'`; um anexo de imagem do cliente não é tratado
nem seta `mensagem_cliente` — se o cliente mandar só uma foto (sem legenda
digitada), a mensagem provavelmente é tratada como vazia. Se isso também
importa pro caso de uso (cliente manda foto da praga), precisa de um segundo
`if (attachment.type === 'image')`, salvando a URL da foto em `mensagens`
(`remetente = 'cliente'`, `formato = 'imagem'`) do mesmo jeito do item 1.

**3. Áudio — sem mudança necessária, mas com uma limitação que vale explicar**

Hoje `formato = 'audio'` já existe e o `conteudo` guarda a **transcrição**
(texto), não um link pro arquivo de áudio — nem o áudio do cliente (baixado
temporariamente da Meta só pra passar pelo Gemini) nem o áudio gerado por TTS
(Azure Speech) pra resposta da IA são salvos em lugar nenhum permanente. Isso
significa que, mesmo depois dos itens 1 e 2, a transcrição continua sendo tudo
que o deskcomm pode mostrar pra mensagens de áudio — não tem link pra tocar.
Pra mudar isso seria preciso um passo a mais no n8n (subir o arquivo de áudio
pra um storage permanente — Supabase Storage ou o mesmo Azure Blob já usado
por `midias` — e salvar essa URL em vez de/além da transcrição). Isso é bem
mais trabalho (upload, custo de storage recorrente) que os itens 1/2, então
fica como decisão separada, não bloqueia o resto.

### Do lado da API e do deskcomm

- **Esta API não precisa de nenhuma mudança** — `GET
  /api/atendimentos/:id/mensagens` já faz `SELECT *` em `mensagens`, então
  `formato` e qualquer `conteudo` (texto ou URL) já vão automaticamente na
  resposta assim que o n8n passar a gravá-los.
- **O deskcomm já foi ajustado** pra renderizar `formato = 'imagem'` como
  `<img>` e `'video'` como `<video>` (só falta o n8n mandar o dado); mensagens
  de áudio agora aparecem com um rótulo deixando claro que eram uma mensagem
  de voz transcrita, em vez de parecer texto digitado.

---

## Modelo de dados tocado (Postgres/Supabase)

| Tabela | Escrita por | Leitura por |
|---|---|---|
| `clientes` | Webhook (upsert por `id_face`), Atualizar Pedido (cep/nome) | Avaliação de IA (via join), API de dashboard |
| `atendimentos` | Webhook (cria), Cotar Frete (status), Atualizar Pedido (fecha), Avaliação de IA (nota), API (`/api/atendimentos/sinalizar` e `/:id/encerrar`) | API de dashboard |
| `mensagens` | Webhook (mensagem do cliente), Agente de IA (resposta da IA) | Avaliação de IA (monta a transcrição), API (`GET /api/atendimentos/:id/mensagens`) |
| `vendas` | Atualizar Pedido | API de dashboard |

O catálogo de produtos não está em nenhuma tabela do Postgres — é lido diretamente do Google Sheets pelo `[Fluxo Busca] | Planilha`. A memória de conversa do LangChain (usada pelo Agente de IA para manter contexto) também é uma tabela própria, separada de `mensagens`.

Os campos gravados por `[Sub-Fluxo] | Avaliação de IA` (`nota_feedback`, `categoria_feedback`, `qualidade_ia`, `insights_ia`) são os mesmos já expostos por `GET /api/dashboard/vendas` em `atendimento_detalhes` nesta API.

---

## Integrações externas

| Serviço | Usado por | Finalidade |
|---|---|---|
| Meta Graph API | Webhook Facebook, Agente de IA | Receber e enviar mensagens/comentários |
| Google Sheets | Fluxo Busca | Catálogo de produtos |
| Groq | Agente de IA, classificador de comentário, Avaliação de IA | Inferência LLM |
| Google Gemini | Webhook Facebook | Transcrição de áudio recebido |
| Azure Cognitive Services (Speech) | Agente de IA | Text-to-speech das respostas em áudio |
| Frenet | Cotar Frete | Cotação de transportadoras |
| ViaCEP | Cotar Frete | CEP → UF |
| SMTP | Atualizar Pedido | Aviso de venda fechada |
| Supabase (Postgres + REST) | Todos os fluxos acima | Persistência |

---

## Caminho para o WhatsApp

O núcleo do funil (Agente de IA, catálogo, frete, fechamento, avaliação) não muda — o que muda é a camada de entrada/saída de mensagens, hoje concentrada no `[Webhook] | Facebook`. Diferenças relevantes entre as APIs do Meta:

| | Messenger (atual) | WhatsApp Cloud API |
|---|---|---|
| Formato do evento recebido | `entry[].messaging[]` | `entry[].changes[].value.messages[]` |
| Identificador do remetente | `sender.id` (PSID da página) | `messages[].from` (número de telefone) |
| Endpoint de envio | `graph.facebook.com/.../me/messages`, com token de **página** | mesmo domínio, usando `phone_number_id` e token da **WhatsApp Business Account** |
| Janela de atendimento | sem limite rígido | **24 horas** desde a última mensagem do cliente; depois disso, só mensagens de **template pré-aprovado** pelo Meta |
| Opt-in | implícito ao iniciar conversa no Messenger | regras mais estritas contra spam — cliente precisa ter iniciado contato ou aceitado receber mensagens |
| Áudio recebido | attachment com URL temporária da Meta | mídia referenciada por `media id`, exige um endpoint próprio de download antes de repassar ao Gemini |

Como `id_face` é hoje o identificador central em todas as tabelas (`clientes.id_face` e em todo `queryReplacement` dos SQLs), o caminho mais direto para adicionar WhatsApp sem redesenhar o banco é usar o número de telefone como valor de `id_face` nesse canal (o campo é `TEXT`, não preso ao formato de PSID) e usar a coluna `origem` de `atendimentos` (já existente) para diferenciar o canal de cada atendimento — o dashboard já devolve `canal` por atendimento.

---

## Relação com o resto do projeto

- Esta API (`api-treenity-bot`) principalmente **lê** o que o bot escreve (`clientes`, `atendimentos`, `vendas`, `mensagens`); a única escrita que ela faz nessas tabelas é a sinalização/encerramento de atendimento. Nenhuma mudança nela é necessária para o bot passar a atender pelo WhatsApp, desde que continue escrevendo nas mesmas tabelas.
- O chat interno desta API (`chat_conversas`/`chat_mensagens`) é um sistema separado do `mensagens` do bot — um é conversa cliente↔IA, o outro é funcionário↔funcionário.
- `GET /api/atendimentos/:id/mensagens` e `GET /api/atendimentos/sinalizados` expõem o histórico de conversa cliente↔bot e a lista de atendimentos precisando de atenção. A expectativa é que o **deskcomm monte essa tela com os dados/telas dele próprio** (é o produto de CRM/inbox); essas rotas existem como caminho alternativo caso ele não tenha uma forma de puxar os dados específicos deste bot.
