# Deploy — Dros Hub

## Infra

- **VPS:** vps-5269157.3store.com.br (HostGator, root SSH)
- **OS:** CentOS 7 / TuxCare ELS
- **Node:** 16.x via nvm (`source ~/.nvm/nvm.sh && nvm use 16`)
- **Web server:** Apache 2.4 (cPanel) — proxy reverso pra porta 3003
- **Path:** `/opt/platform`
- **Processo PM2:** `dros-hub`
- **Porta API:** 3003
- **Base path frontend:** `/hub/`
- **URL:** https://drosagencia.com.br/hub

## Estratégia de build

**Frontend é buildado LOCALMENTE.** A pasta `agency-hub/dist/` vai commitada no repo. A VPS nunca roda `npm run build`. Quando muda algo no frontend:

1. No PC local: `cd agency-hub && npm run build`
2. Commit incluindo `agency-hub/dist/`
3. `git push platform master`
4. Na VPS: `git pull && pm2 restart dros-hub`

Se esquecer de buildar antes do commit, usuários continuam vendo bundle antigo.

## Comandos por tipo de mudança

Todos começam com:
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /opt/platform
```

### 1. Só backend (rotas, server/, sem nova dep)
```bash
git pull && pm2 restart dros-hub
```

### 2. Backend + nova dependência npm
```bash
git pull && npm install && pm2 restart dros-hub
```

### 3. Frontend (já buildado localmente)
```bash
git pull && pm2 restart dros-hub
```

### 4. Reset completo (deu pau no lock ou mudou versão de pacote)
```bash
rm -f package-lock.json && git pull && rm -rf node_modules && npm install && pm2 restart dros-hub
```

## Variáveis de ambiente na VPS

Arquivo `/opt/platform/agency-hub/.env`. Variáveis obrigatórias listadas em [.env.example](.env.example).

## Constraints de versão

Como o frontend é buildado local, o PC de dev pode usar Vite 6 / React 19 livremente. A VPS só roda o backend, então o que importa é Node 16 compat:

- **better-sqlite3 ^12.8.0** — funciona em Node 16 com prebuilds. Se quebrar após `npm install`, fazer fallback pra `^10.1.0`
- **express ^5.1.0** — features atuais compat com Node 16

## Compilar módulos nativos (raro)

Se algum dia precisar recompilar `better-sqlite3` na VPS (sem prebuild):
```bash
yum install centos-release-scl devtoolset-11-gcc devtoolset-11-gcc-c++ devtoolset-11-make
source /opt/rh/devtoolset-11/enable
npm install
```

## Troubleshooting rápido

- **PM2 não responde:** `pm2 logs dros-hub --lines 100`
- **502 no Apache:** processo Node morreu, `pm2 restart dros-hub`
- **Bundle antigo:** esqueceu de buildar local antes do commit. Buildar e commitar `dist/`
