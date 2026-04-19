# Project — Dros Hub (Agency Management)

## Codebase Navigation
**Always read `CODEBASE_INDEX.md` before opening any source file.**
It contains the complete file map with exports and purpose for every file.
Use it to locate the exact file you need, then read only that file.

## Git
- **Repo:** https://github.com/soaresjoaoluiz1/platform
- **Branch:** master
- **Remote name:** `platform` (NÃO `origin` — origin aponta pro repo upstream `renatoasse/opensquad`)
- Sempre commit + push ao terminar mudanças. User pede comando de deploy depois.
- Push usa: `git push platform master`

## Deploy (HostGator VPS)

**Servidor:** vps-5269157.3store.com.br (root)
**Caminho do repo:** `/opt/platform`
**Processo PM2:** `dros-hub`
**Node:** v16.x via nvm (`source ~/.nvm/nvm.sh && nvm use 16`)

### IMPORTANTE — Diferença fundamental vs CRM

**No Hub, o frontend é buildado LOCALMENTE antes do commit** — a pasta `agency-hub/dist/` vai commitada no git. Isso significa que:
- No servidor nunca roda `npm run build`
- Mudança só no frontend → `git pull && pm2 restart` (reinicia só pra pegar os arquivos novos que o Express serve como estáticos)
- Build de produção roda no PC local via `npm run build` antes de commitar

Se esquecer de buildar antes, os usuários continuam vendo o bundle antigo.

### Comandos por tipo de mudança

**1. Só backend (rotas, server/, sem mexer em deps):**
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /opt/platform && git pull && pm2 restart dros-hub
```

**2. Backend + nova dependência npm:**
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /opt/platform && git pull && npm install && pm2 restart dros-hub
```

**3. Frontend (.tsx/.ts/.css em src/) — buildado localmente:**

No PC local ANTES do commit:
```bash
cd agency-hub && npm run build
git add agency-hub/dist/ && git commit ... && git push platform master
```

Na VPS (só puxa o dist já buildado):
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /opt/platform && git pull && pm2 restart dros-hub
```

**4. Reset completo (quando muda versão de pacote ou dá pau no lock):**
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /opt/platform && rm -f package-lock.json && git pull && rm -rf node_modules && npm install && pm2 restart dros-hub
```

### Apagar tarefas de teste no DB
```bash
sqlite3 /opt/platform/agency-hub/server/data/hub.db "DELETE FROM ..."
```
Sempre delete em ordem: `task_history` → `task_assignees` → `task_comments` → `task_attachments` → `time_entries` → subtarefas (parent_task_id) → tarefa.

## Constraints de versão

### Backend (roda na VPS)
- **Node 16.x** — atual em produção
- **better-sqlite3: ^12.8.0** — exige Node 18+ oficialmente, mas funciona em Node 16 com prebuilds. Se quebrar após `npm install`, considerar fallback pra `^10.1.0`.
- **express: ^5.1.0** — features usadas são compatíveis com Node 16. Se usar algo mais novo que exija Node 18, fazer fallback pra `^4.21.0`.

### Frontend (buildado local, vai como estático)
- **vite: ^6.3.5** — só roda no PC local (que tem Node 18+)
- **react: ^19.1.0** — só frontend, não afeta Node da VPS

**Ponto crítico:** como o build é local, o PC de dev precisa ter Node 18+. A VPS só precisa rodar o backend — por isso Node 16 funciona.

Se algum dia migrar Node da VPS pra 18+: liberar todas as deps modernas no servidor. Se precisar rodar `npm install` nativo (better-sqlite3 compila C++), pode ser necessário devtoolset-11:
```bash
yum install centos-release-scl devtoolset-11-gcc devtoolset-11-gcc-c++ devtoolset-11-make
source /opt/rh/devtoolset-11/enable
```

## Architecture

- **Frontend:** React 19 + Vite 6 + TypeScript, base path `/hub/`
- **Backend:** Express 5 + SQLite (better-sqlite3), JWT auth, SSE
- **DB:** SQLite em `server/data/hub.db` (auto-init + migrations idempotentes no `server/db.js`)
- **Realtime:** Server-Sent Events em `server/sse.js` (roteamento por account + user)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Roles:** `dono`, `gerente`, `funcionario`, `cliente`

### Workflow Editorial (hardcoded)
Tarefa-mãe `task_type='mae_editorial'` cria 5 subtarefas iniciais:
1. Briefing (Ivandro)
2. Reunião Aprovação Cliente (Briefing)
3. Aprovação Interna Final
4. Aprovação Cliente (Final)
5. Publicação

Dinamicamente (via triggers em `PUT /tasks/:id/stage`):
- Briefing → Criar Imagens (Dalila) paralelo
- Criar Imagens → Programar Publ Imagens (Graziele)
- Reunião → Gravação (Ivandro, data/hora obrigatória)
- Gravação → Subir Arquivos (Ivandro)
- Subir Arquivos → Editar Vídeos (Ivandro)
- Editar Vídeos → Programar Publ Vídeos (Graziele)

Quando todas as 11 subtarefas conhecidas concluem, mãe auto-fecha.

Usuários hardcoded por busca `LIKE`: Ivandro, Dalila, Graziele.

### Outras features-chave
- **Timer automático:** entra em `em_producao` → auto-start; sai → auto-stop com duração calculada. Mãe agrega tempo das filhas.
- **Calendário de Gravações** (`/gravacoes`): mostra tarefas com `subtask_kind='gravacao'` OU depto Captação + `recording_datetime`.
- **Solicitação de tarefa pelo cliente:** cliente cria via Dashboard ou Tarefas → stage `solicitacao_pendente` → gerente/CEO aprova em Aprovações → vira `backlog`.
- **Solicitar Alteração:** cliente em aprovação pode pedir alteração com texto específico → tarefa volta pra `revisao_interna` + flag na pipeline + banner no TaskDetail.
- **Financeiro:** DRE, despesas fixas/variáveis, parcelamentos, receitas extras. Todas operações com `paid_at`.

## Conventions

- Mensagens de commit em português, prefixo `feat:`, `fix:`, `refactor:`, `chore:`
- Escopo `(agency-hub)` nos commits
- Sem emojis em código (só se o user pedir)
- Multi-tenant: toda query filtra por `client_id` do usuário logado
- Cliente só vê tarefas em: `aguardando_cliente`, `aprovado_cliente`, `programar_publicacao`, `concluido`, `rejeitado`, `solicitacao_pendente`
- Descrição, prazo, responsável, departamento, arquivo bruto são ocultos do cliente
