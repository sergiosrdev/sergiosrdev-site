const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "app.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function ensureColumns() {
  const columns = await all("PRAGMA table_info(users)");
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("email_verified")) {
    await run("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
  }

  if (!names.has("email_verification_token")) {
    await run("ALTER TABLE users ADD COLUMN email_verification_token TEXT");
  }

  if (!names.has("password_reset_token")) {
    await run("ALTER TABLE users ADD COLUMN password_reset_token TEXT");
  }

  if (!names.has("password_reset_expires_at")) {
    await run("ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME");
  }
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      email_verification_token TEXT,
      password_reset_token TEXT,
      password_reset_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumns();
}

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ message: "Não autenticado." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Sessão inválida." });
  }
}

function setAuthCookie(res, token) {
  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function toDevTokenPayload(token, label) {
  if (isProduction()) {
    return {};
  }

  return {
    devToken: token,
    devHint: `${label}: ${token}`
  };
}

function generateShortToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nome, e-mail e senha são obrigatórios." });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedName = String(name).trim();

  try {
    const existingUser = await get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);

    if (existingUser) {
      return res.status(409).json({ message: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = generateShortToken();

    await run(
      "INSERT INTO users (name, email, password_hash, email_verified, email_verification_token) VALUES (?, ?, ?, 0, ?)",
      [trimmedName, normalizedEmail, passwordHash, verificationToken]
    );

    const response = {
      message: "Cadastro realizado. Verifique seu e-mail com o código de verificação."
    };

    Object.assign(response, toDevTokenPayload(verificationToken, "código de verificação"));

    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao registrar usuário." });
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ message: "E-mail e código são obrigatórios." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedToken = String(token).trim().toUpperCase();

  try {
    const user = await get(
      "SELECT id, email_verified, email_verification_token FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    if (user.email_verified) {
      return res.json({ message: "E-mail já verificado." });
    }

    if (!user.email_verification_token || user.email_verification_token !== normalizedToken) {
      return res.status(400).json({ message: "Código de verificação inválido." });
    }

    await run(
      "UPDATE users SET email_verified = 1, email_verification_token = NULL WHERE id = ?",
      [user.id]
    );

    return res.json({ message: "E-mail verificado com sucesso. Agora você já pode fazer login." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao verificar e-mail." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const user = await get(
      "SELECT id, name, email, password_hash, email_verified FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (!user) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    if (!user.email_verified) {
      return res.status(403).json({ message: "Confirme seu e-mail antes de entrar." });
    }

    const payloadUser = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    const token = signToken(payloadUser);
    setAuthCookie(res, token);

    return res.json({
      message: "Login realizado com sucesso.",
      user: payloadUser
    });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao autenticar." });
  }
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "E-mail obrigatório." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const user = await get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);

    if (!user) {
      return res.json({ message: "Se o e-mail existir, enviaremos o código de redefinição." });
    }

    const resetToken = generateShortToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await run(
      "UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?",
      [resetToken, expiresAt, user.id]
    );

    const response = {
      message: "Se o e-mail existir, enviaremos o código de redefinição."
    };

    Object.assign(response, toDevTokenPayload(resetToken, "código de redefinição"));

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao solicitar redefinição de senha." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: "E-mail, código e nova senha são obrigatórios." });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: "A nova senha precisa ter pelo menos 6 caracteres." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedToken = String(token).trim().toUpperCase();

  try {
    const user = await get(
      "SELECT id, password_reset_token, password_reset_expires_at FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (!user || !user.password_reset_token || user.password_reset_token !== normalizedToken) {
      return res.status(400).json({ message: "Código de redefinição inválido." });
    }

    if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ message: "Código expirado. Solicite um novo código." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await run(
      "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?",
      [passwordHash, user.id]
    );

    return res.json({ message: "Senha redefinida com sucesso. Você já pode fazer login." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao redefinir senha." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction()
  });

  return res.json({ message: "Logout realizado com sucesso." });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar banco de dados:", error);
    process.exit(1);
  });

