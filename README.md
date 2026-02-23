# SérgioSRDev Site (Full Stack)

Portfólio com autenticação de usuários.

## Recursos

- Registro de conta
- Verificação de e-mail por código
- Login com sessão em cookie httpOnly
- Recuperação de senha por código
- Logout e consulta de sessão atual

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Banco: SQLite
- Auth: JWT em cookie `httpOnly`

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. (Opcional) defina variáveis de ambiente:

```bash
set JWT_SECRET=sua_chave_super_secreta
set NODE_ENV=development
```

3. Inicie o servidor:

```bash
npm run dev
```

4. Abra no navegador:

```text
http://localhost:3000
```

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Estrutura

- `server.js`: API e servidor estático
- `app.js`: lógica do frontend de autenticação
- `index.html`: UI do portfólio + formulários auth
- `style.css`: estilos da UI
- `data/app.db`: banco SQLite criado automaticamente

