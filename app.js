const yearEl = document.getElementById("year");
const authSection = document.getElementById("auth");
const topbar = document.getElementById("topo");
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.querySelectorAll(".nav a");
const themeSelect = document.getElementById("theme-select");
const authTabs = document.querySelectorAll(".auth-tab");
const authPanels = document.querySelectorAll(".auth-panel");
const registerForm = document.getElementById("register-form");
const verifyForm = document.getElementById("verify-form");
const loginForm = document.getElementById("login-form");
const resetRequestForm = document.getElementById("reset-request-form");
const resetPasswordForm = document.getElementById("reset-password-form");
const logoutButton = document.getElementById("logout-btn");
const authStatus = document.getElementById("auth-status");
const authUserName = document.getElementById("auth-user-name");
const authUserEmail = document.getElementById("auth-user-email");
const verifyTokenInput = document.getElementById("verify-token");
const resetTokenInput = document.getElementById("reset-token");
const THEME_KEY = "site_theme";

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

function setTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  if (themeSelect) themeSelect.value = safeTheme;
}

function initTheme() {
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    setTheme(storedTheme);
    return;
  }

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

function showAuthPanel(panelName = "login") {
  if (!authPanels.length) return;

  authPanels.forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== panelName;
  });

  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authView === panelName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function closeMobileMenu() {
  if (!topbar || !menuToggle) return;
  topbar.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
}

function toggleMobileMenu() {
  if (!topbar || !menuToggle) return;
  const open = topbar.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
}

function setMessage(message, isError = false) {
  if (!authStatus) return;

  authStatus.textContent = message;
  authStatus.classList.toggle("error", isError);
  authStatus.classList.toggle("success", !isError);
}

function setLoggedState(user) {
  if (!authSection) return;

  authSection.classList.add("is-authenticated");
  authSection.classList.remove("is-guest");

  if (authUserName) authUserName.textContent = user.name || "usuário";
  if (authUserEmail) authUserEmail.textContent = user.email || "";
}

function setGuestState() {
  if (!authSection) return;

  authSection.classList.add("is-guest");
  authSection.classList.remove("is-authenticated");

  if (authUserName) authUserName.textContent = "";
  if (authUserEmail) authUserEmail.textContent = "";

  showAuthPanel("login");
}

function applyDevToken(token, type) {
  if (!token) return;

  if (type === "verify" && verifyTokenInput) {
    verifyTokenInput.value = token;
  }

  if (type === "reset" && resetTokenInput) {
    resetTokenInput.value = token;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.message || "Erro inesperado.");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function checkSession() {
  try {
    const data = await request("/api/auth/me", { method: "GET" });
    setLoggedState(data.user);
    setMessage(`Sessão ativa. Bem-vindo(a), ${data.user.name}!`);
  } catch {
    setGuestState();
    setMessage("Crie sua conta, verifique e-mail e faça login.");
  }
}

if (themeSelect) {
  themeSelect.addEventListener("change", () => {
    setTheme(themeSelect.value);
  });
}

if (authTabs.length) {
  authTabs.forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.classList.contains("is-active")));
    tab.addEventListener("click", () => {
      showAuthPanel(tab.dataset.authView || "login");
    });
  });
}

if (menuToggle) {
  menuToggle.addEventListener("click", toggleMobileMenu);
}

if (navLinks.length) {
  navLinks.forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) {
    closeMobileMenu();
  }
});

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(registerForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || "")
    };

    try {
      const data = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      registerForm.reset();
      applyDevToken(data.devToken, "verify");
      setGuestState();
      showAuthPanel("verify");
      setMessage(data.devHint ? `${data.message} ${data.devHint}` : data.message || "Cadastro realizado.");
    } catch (error) {
      setMessage(error.message || "Não foi possível registrar.", true);
    }
  });
}

if (verifyForm) {
  verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(verifyForm);
    const payload = {
      email: String(formData.get("email") || "").trim(),
      token: String(formData.get("token") || "").trim()
    };

    try {
      const data = await request("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showAuthPanel("login");
      setMessage(data.message || "E-mail verificado com sucesso.");
    } catch (error) {
      setMessage(error.message || "Não foi possível verificar e-mail.", true);
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const payload = {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || "")
    };

    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      loginForm.reset();
      setLoggedState(data.user);
      setMessage(data.message || "Login realizado com sucesso.");
    } catch (error) {
      setGuestState();
      setMessage(error.message || "Não foi possível entrar.", true);
    }
  });
}

if (resetRequestForm) {
  resetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(resetRequestForm);
    const payload = {
      email: String(formData.get("email") || "").trim()
    };

    try {
      const data = await request("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      applyDevToken(data.devToken, "reset");
      showAuthPanel("reset-password");
      setMessage(data.devHint ? `${data.message} ${data.devHint}` : data.message || "Solicitacao enviada.");
    } catch (error) {
      setMessage(error.message || "Não foi possível solicitar redefinição.", true);
    }
  });
}

if (resetPasswordForm) {
  resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(resetPasswordForm);
    const payload = {
      email: String(formData.get("email") || "").trim(),
      token: String(formData.get("token") || "").trim(),
      newPassword: String(formData.get("newPassword") || "")
    };

    try {
      const data = await request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      resetPasswordForm.reset();
      showAuthPanel("login");
      setMessage(data.message || "Senha redefinida com sucesso.");
    } catch (error) {
      setMessage(error.message || "Não foi possível redefinir senha.", true);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      const data = await request("/api/auth/logout", { method: "POST" });
      setGuestState();
      setMessage(data.message || "Logout realizado com sucesso.");
    } catch (error) {
      setMessage(error.message || "Não foi possível sair.", true);
    }
  });
}

initTheme();
checkSession();
