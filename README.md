# MediCore Fisio

Sistema de gestão clínica para fisioterapia — desenvolvido sobre a base MediCore, customizado para a **Clínica Dra. Alessandra Monteiro**.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Servidor | GCP VPS · Debian 12 · Apache 2 |
| Backend | PHP 8.2 procedural |
| Banco | MariaDB |
| Frontend | HTML5 · TailwindCSS CDN · Vanilla JS |
| Design | Figma → implementação gradual |
| Deploy | Git · deploy.sh (auto-commit + push) |

**Domínio:** `fisio.urqongroup.com.br`  
**Repo:** `github.com/iH1VE/medicore-fisio` (privado)  
**Branch produção:** `main`

---

## Módulos implementados

### Clínica (MediCore core)
- **Pacientes** — cadastro, busca, histórico, observações internas com flags
- **Agenda / Calendário** — agendamentos, menu rápido, visualização mensal
- **Atendimento** — registro de consultas, observações vinculadas ao paciente
- **Anamnese** — formulário estruturado por atendimento
- **Prescrição** — geração e impressão
- **Exames** — solicitação e resultado
- **Financeiro** — receitas, despesas, relatório por período
- **Protocolos** — criação e venda de pacotes
- **Cupons** — desconto percentual ou fixo, com validade, limite de usos, editar/excluir

### Clube de Benefícios
- **Recompensas** — cards com pontos, estoque, status (Ativo / Esgotado)
- **Resgates** — aprovação/rejeição de solicitações
- **Sistema de indicação** — geração de links e rastreamento
- **Acesso ao Clube** — criado a partir do MediCore, sessão restaurada via `restore_session.php`

### Administrativo
- **Relatórios** — financeiro, pacientes, agendamentos, estoque + relatório personalizado
- **Auditoria** — log de ações com filtros por usuário, ação e período

---

## Arquitetura

```
/var/www/html/
├── index.html          # SPA principal (todos os módulos via sections)
├── script.js           # Lógica JS (renderização, CRUD, API calls)
├── style.css           # Estilos customizados (complementa Tailwind)
├── deploy.sh           # git add -A → commit → push origin main
│
├── api/                # APIs REST (PHP procedural)
│   ├── _common.php     # Helpers: respond_json, map_rows, ensure_table
│   ├── db.php          # Conexão MariaDB (carrega config.local.php)
│   ├── config.local.php  # ⚠️ Credenciais — GITIGNORED
│   ├── login.php       # Autenticação + normalização de tipo (strtoupper)
│   ├── restore_session.php  # Restaura $_SESSION após refresh de página
│   ├── cupons.php      # GET / POST / DELETE cupons
│   └── ...             # demais endpoints
│
├── api-clube/          # APIs do Clube de Benefícios
│   ├── admin_rewards.php
│   ├── redemptions.php
│   └── ...
│
└── clube/              # Webapp do cliente (acesso ao clube)
```

### Persistência JS → Banco

O frontend usa `localStorage` como cache local (`DB.*`) e sincroniza com o banco via:

```js
// Mapeamento JS key → endpoint PHP
const API_COLLECTION_URLS = {
    cupons:      'api/cupons.php',
    protocolos:  'api/protocolos.php',
    // ...
};

apiLoadResources();          // carrega todos na inicialização
apiUpsertResource(key, obj); // salva/atualiza no banco
```

> **Regra:** ao adicionar uma nova coleção, atualizar **tanto** `API_COLLECTION_URLS` **quanto** o bloco de atribuição em `loadDB()`.

---

## Configuração local (VPS)

```bash
# /var/www/html/api/config.local.php  (não commitado)
define('DB_HOST', 'localhost');
define('DB_NAME', 'medicoredb');
define('DB_USER', 'meusite_user');
define('DB_PASS', 'SUA_SENHA');
```

Credenciais de fallback em variáveis de ambiente caso o arquivo não exista.

---

## Deploy

```bash
# Na VPS
bash /var/www/html/deploy.sh "descrição do que foi alterado"

# Ou via SSH local
ssh -i ~/.ssh/id_ed25519 merceswilliam@34.121.160.84 \
  "bash /var/www/html/deploy.sh 'mensagem'"
```

Para enviar um arquivo editado localmente:

```bash
scp -i ~/.ssh/id_ed25519 arquivo.html merceswilliam@34.121.160.84:/tmp/ \
  && ssh -i ~/.ssh/id_ed25519 merceswilliam@34.121.160.84 \
     "sudo cp /tmp/arquivo.html /var/www/html/arquivo.html && bash /var/www/html/deploy.sh 'mensagem'"
```

---

## Autenticação

- Login: `api/login.php` → seta `$_SESSION['user_tipo']` em **UPPERCASE**
- Papel admin: `tipo = 'ADMIN'` (normalizado via `strtoupper` no login)
- Refresh de página: `restore_session.php` recarrega a sessão PHP a partir do `user_id` em localStorage

---

## Segurança

- Credenciais de banco em `config.local.php` (gitignored) — nunca hardcoded no repo
- `db.php` carrega de `config.local.php` com fallback para variáveis de ambiente
- Repo GitHub **privado** · histórico reescrito após exposição acidental
- `restore_session.php` valida token **HMAC-SHA256** antes de restaurar sessão PHP
  - Token gerado no login: `hmac(sha256, user_id:email, SECRET_KEY)`
  - `SECRET_KEY` definida em `config.local.php` (nunca commitada)
  - Sem token válido, POST para restore_session retorna 403

---

## Convenções de código

- **Formulários**: todos os `addEventListener('submit')` unificados em um único handler no `script.js` — cada formulário identificado por `e.target.id`
- **Novas coleções**: ao adicionar, atualizar tanto `API_COLLECTION_URLS` quanto o bloco de atribuição em `loadDB()`
- **Patches**: aplicar na VPS via script Python (`scp` + `sudo python3`) e commitar com `deploy.sh`

---

## Histórico de versões

| Data | Descrição |
|------|-----------|
| 2026-05 | Setup inicial VPS Fisio · migração banco · config Apache |
| 2026-05 | Redesign Figma: Financeiro, Recompensas (cards), Resgates, Relatórios, Auditoria |
| 2026-05 | Cupons: persistência no banco, design Figma, editar/excluir |
| 2026-05 | Segurança: credenciais → config.local.php, repo privado, histórico limpo |
| 2026-05 | Calendário: layout Figma, sidebar de agenda |
| 2026-05 | Qualidade: db.php sem hardcode, .bak/.zip removidos do git, restore_session com HMAC, listeners unificados |
