(function () {
  const API = {
    login: "/api-clube/login.php",
    register: "/api-clube/register.php",
    me: "/api-clube/me.php",
    logout: "/api-clube/logout.php",
    dashboard: "/api-clube/dashboard.php",
    rewards: "/api-clube/rewards.php",
    redeem: "/api-clube/redeem.php",
    myRedemptions: "/api-clube/my_redemptions.php",
    referralsLink: "/api-clube/referrals_link.php",
    myReferrals: "/api-clube/my_referrals.php"
  };

  function formatPoints(value) {
    return Number(value || 0).toLocaleString("pt-BR");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(String(value).replace(" ", "T"));
    return isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
  }

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Erro na requisição");
    }

    return data;
  }

  async function getJSON(url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "same-origin"
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Erro na requisição");
    }

    return data;
  }

  function fillUserData(user, progress) {
    const sidebarName = document.getElementById("sidebar-user-name");
    const heroName = document.getElementById("hero-user-name");
    const sidebarPoints = document.getElementById("sidebar-user-points");
    const heroPoints = document.getElementById("hero-user-points");
    const sidebarLevel = document.getElementById("sidebar-user-level");
    const sidebarRole = document.getElementById("sidebar-user-role");

    if (sidebarName) sidebarName.textContent = user.nome || "Paciente";
    if (heroName) heroName.textContent = user.nome || "Paciente";
    if (sidebarPoints) sidebarPoints.textContent = formatPoints(user.pontos);
    if (heroPoints) heroPoints.textContent = formatPoints(user.pontos);
    if (sidebarLevel) sidebarLevel.textContent = user.nivel || "Bronze";
    if (sidebarRole) sidebarRole.textContent = "Paciente";

    const heroBadge = document.querySelector(".hero-badge");
    if (heroBadge) heroBadge.textContent = user.nivel || "Bronze";

    const totalEl = document.querySelector(".hero-sub");
    if (totalEl) totalEl.textContent = `${formatPoints(user.pontos_total)} pontos acumulados no total`;

    const progressHeader = document.querySelector(".hero-progress-header strong");
    if (progressHeader) progressHeader.textContent = `${progress.progress_percent || 0}%`;

    const progressLabel = document.querySelector(".hero-progress-header span");
    if (progressLabel) progressLabel.textContent = `Progresso para ${progress.next_level || "Próximo nível"}`;

    const progressFill = document.querySelector(".progress-fill");
    if (progressFill) progressFill.style.width = `${progress.progress_percent || 0}%`;

    const foot = document.querySelector(".hero-foot");
    if (foot) {
      foot.textContent = progress.missing_points > 0
        ? `Faltam ${formatPoints(progress.missing_points)} pontos`
        : "Você já está no nível máximo atual";
    }
  }

  function getFriendlyHistoryTitle(item) {
    if (item?.descricao && String(item.descricao).trim()) {
      return String(item.descricao).trim();
    }

    const origem = String(item?.origem || "").toLowerCase();

    if (origem === "consulta") return "Consulta realizada";
    if (origem === "procedimento") return "Procedimento estético";
    if (origem === "plano") return "Plano mensal fechado";
    if (origem === "resgate") return "Resgate de prêmio";
    if (origem === "manual") return "Lançamento manual";
    if (origem === "manual_admin") return "Lançamento administrativo";
    if (origem === "protocolo") return "Compra de protocolo";

    return item?.origem || "Movimentação de pontos";
  }

  function renderHistory(history) {
    const container = document.querySelector("#page-historico .history-list");
    if (!container) return;

    if (!history || !history.length) {
      container.innerHTML = `
        <div class="history-item">
          <div>
            <h4>Nenhuma movimentação ainda</h4>
            <p>Seu histórico de pontos aparecerá aqui.</p>
          </div>
          <strong>0</strong>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(item => {
      const cls = item.tipo === "gasto" ? "negative-text" : "positive-text";
      const signal = item.tipo === "gasto" ? "-" : "+";
      const title = getFriendlyHistoryTitle(item);

      return `
        <div class="history-item">
          <div>
            <h4>${title}</h4>
            <p>${formatDateTime(item.created_at)}</p>
          </div>
          <strong class="${cls}">${signal}${formatPoints(item.pontos)}</strong>
        </div>
      `;
    }).join("");
  }

  function updateHistorySummary(history) {
    const positiveCard = document.querySelector(".stat-card.positive strong");
    const negativeCard = document.querySelector(".stat-card.negative strong");

    let totalGain = 0;
    let totalSpent = 0;

    (history || []).forEach(item => {
      if (item.tipo === "gasto") totalSpent += Number(item.pontos || 0);
      else totalGain += Number(item.pontos || 0);
    });

    if (positiveCard) positiveCard.textContent = `+${formatPoints(totalGain)}`;
    if (negativeCard) negativeCard.textContent = `-${formatPoints(totalSpent)}`;
  }

  function rewardPlaceholderClass(index) {
    const classes = ["placeholder-bg-1", "placeholder-bg-2", "placeholder-bg-3"];
    return classes[index % classes.length];
  }

  function getRedemptionStatusLabel(status) {
    const map = {
      pendente: "Pendente",
      entregue: "Entregue",
      utilizado: "Utilizado",
      cancelado: "Cancelado"
    };
    return map[status] || status || "-";
  }

  function getRedemptionStatusClass(status) {
    if (status === "pendente") return "text-[#6F4B36]";
    if (status === "entregue") return "positive-text";
    if (status === "utilizado") return "positive-text";
    if (status === "cancelado") return "negative-text";
    return "";
  }

  function renderMyRedemptions(items) {
    const container = document.getElementById("my-redemptions-list");
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = `
        <div class="history-item">
          <div>
            <h4>Nenhum resgate realizado</h4>
            <p>Seus prêmios resgatados aparecerão aqui.</p>
          </div>
          <strong>—</strong>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="history-item">
        <div>
          <h4>${item.reward_nome || "Prêmio resgatado"}</h4>
          <p>${formatDateTime(item.created_at)} • ${item.observacao || "Sem observações"}</p>
        </div>
        <strong class="${getRedemptionStatusClass(item.status)}">${getRedemptionStatusLabel(item.status)}</strong>
      </div>
    `).join("");
  }


  function renderMyReferrals(data) {
    const codeDisplay = document.getElementById("referral-code-display");
    const codeShare = document.getElementById("referral-code-share");
    const totalIndicacoes = document.getElementById("referral-total-indicacoes");
    const totalConvertidos = document.getElementById("referral-total-convertidos");
    const totalBonus = document.getElementById("referral-total-bonus");
    const list = document.getElementById("my-referrals-list");

    const summary = data?.summary || {};
    const items = data?.items || [];

    if (codeDisplay) codeDisplay.textContent = summary.referral_code || "—";
    if (codeShare) codeShare.value = summary.referral_code || "";
    if (totalIndicacoes) totalIndicacoes.textContent = formatPoints(summary.total_indicacoes || 0);
    if (totalConvertidos) totalConvertidos.textContent = formatPoints(summary.total_convertidos || 0);
    if (totalBonus) totalBonus.textContent = formatPoints(summary.total_bonus || 0);

    if (!list) return;

    if (!items.length) {
      list.innerHTML = `
        <div class="history-item">
          <div>
            <h4>Nenhuma indicação ainda</h4>
            <p>Compartilhe seu código para começar a acumular bônus.</p>
          </div>
          <strong>—</strong>
        </div>
      `;
      return;
    }

    list.innerHTML = items.map(item => `
      <div class="history-item">
        <div>
          <h4>${item.indicado_nome || item.indicado_email || "Novo indicado"}</h4>
          <p>${formatDateTime(item.created_at)} • código usado: ${item.referral_code_used || "-"}</p>
        </div>
        <strong class="${item.status === "convertido" ? "positive-text" : ""}">
          ${item.status === "convertido" ? "+" + formatPoints(item.bonus_referrer_points || 0) : "Cadastro"}
        </strong>
      </div>
    `).join("");
  }

  function copyReferralCode() {
    const field = document.getElementById("referral-code-share");
    if (!field || !field.value) return;
    navigator.clipboard.writeText(field.value)
      .then(() => alert("Código copiado com sucesso"))
      .catch(() => alert("Não foi possível copiar o código"));
  }

  window.copyReferralCode = copyReferralCode;

  async function redeemReward(rewardId) {
    try {
      const result = await postJSON(API.redeem, { reward_id: rewardId });
      alert(result.message || "Resgate realizado com sucesso");

      const dashboardData = await getJSON(API.dashboard);
      fillUserData(dashboardData.user, dashboardData.progress);
      renderHistory(dashboardData.history || []);
      updateHistorySummary(dashboardData.history || []);

      const rewardsData = await getJSON(API.rewards);
      renderRewards(rewardsData.rewards || [], dashboardData.user);

      const redemptionsData = await getJSON(API.myRedemptions);
      renderMyRedemptions(redemptionsData.items || []);
    } catch (err) {
      alert(err.message || "Erro ao resgatar prêmio");
    }
  }

  function renderRewards(rewards, user) {
    const container = document.querySelector("#page-premios .cards-grid");
    const pointsLabel = document.querySelector("#page-premios .title-banner p");
    if (!container) return;

    if (pointsLabel && user) {
      pointsLabel.innerHTML = `Você tem <strong>${formatPoints(user.pontos)}</strong> pontos disponíveis`;
    }

    if (!rewards || !rewards.length) {
      container.innerHTML = `
        <div class="panel-card" style="grid-column: 1 / -1;">
          <div class="section-head">
            <h3>Nenhum prêmio disponível</h3>
            <p>Cadastre recompensas para exibir aqui.</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = rewards.map((reward, index) => {
      const pontos = Number(reward.pontos || 0);
      const estoque = reward.estoque === null ? null : Number(reward.estoque);
      const semEstoque = estoque !== null && estoque <= 0;
      const pontosUsuario = Number(user?.pontos || 0);
      const semPontos = pontosUsuario < pontos;
      const disabled = semEstoque || semPontos;

      let estoqueLabel = "Estoque ilimitado";
      if (estoque !== null) {
        estoqueLabel = semEstoque ? "Sem estoque" : `${estoque} disponível(eis)`;
      }

      return `
        <article class="reward-card">
          <div class="reward-image ${rewardPlaceholderClass(index)}"></div>
          <div class="reward-body">
            <h3>${reward.nome}</h3>
            <p>${reward.descricao || "Recompensa disponível no Clube Premium."}</p>
            <div class="reward-price">${formatPoints(pontos)} pontos</div>
            <div style="margin-bottom: 14px; color: var(--muted); font-size: 14px;">${estoqueLabel}</div>
            <button
              class="btn-primary full"
              ${disabled ? "disabled" : ""}
              data-reward-id="${reward.id}"
              style="${disabled ? "opacity:.6;cursor:not-allowed;" : ""}"
            >
              ${semEstoque ? "Indisponível" : (semPontos ? "Pontos insuficientes" : "Resgatar Agora")}
            </button>
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-reward-id]").forEach(btn => {
      if (btn.hasAttribute("disabled")) return;
      btn.addEventListener("click", () => redeemReward(Number(btn.dataset.rewardId)));
    });
  }

  function initLoginPage() {
    const loginForm = document.getElementById("club-login-form");
    const registerForm = document.getElementById("club-register-form");
    const feedback = document.getElementById("club-auth-feedback");
    if (!loginForm || !registerForm) return;

    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      feedback.textContent = "";

      const email = document.getElementById("login-email").value.trim();
      const senha = document.getElementById("login-password").value.trim();

      try {
        await postJSON(API.login, { email, senha });
        window.location.href = "/clube/index.html";
      } catch (err) {
        feedback.textContent = err.message || "Erro ao entrar.";
      }
    });

    registerForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      feedback.textContent = "";

      const nome = document.getElementById("register-name").value.trim();
      const email = document.getElementById("register-email").value.trim();
      const telefone = document.getElementById("register-phone").value.trim();
      const senha = document.getElementById("register-password").value.trim();
      const referral_code = document.getElementById("register-referral").value.trim();

      try {
        await postJSON(API.register, { nome, email, telefone, senha, referral_code });

        if (referral_code) {
          try {
            await postJSON(API.referralsLink, { referral_code });
          } catch (linkErr) {
            console.error("Erro ao vincular indicação:", linkErr);
          }
        }

        feedback.textContent = "Conta criada com sucesso. Redirecionando...";
        setTimeout(() => {
          window.location.href = "/clube/index.html";
        }, 500);
      } catch (err) {
        feedback.textContent = err.message || "Erro ao criar conta.";
      }
    });
  }

  async function initDashboardPage() {
    const isDashboard = document.querySelector(".club-shell");
    if (!isDashboard) return;

    let data;
    try {
      data = await getJSON(API.dashboard);
    } catch (err) {
      window.location.href = "/clube/login.html";
      return;
    }

    fillUserData(data.user, data.progress);
    renderHistory(data.history || []);
    updateHistorySummary(data.history || []);

    try {
      const rewardsData = await getJSON(API.rewards);
      renderRewards(rewardsData.rewards || [], data.user);
    } catch (err) {
      console.error("Erro ao carregar recompensas:", err);
    }

    try {
      const redemptionsData = await getJSON(API.myRedemptions);
      renderMyRedemptions(redemptionsData.items || []);
    } catch (err) {
      console.error("Erro ao carregar meus resgates:", err);
      renderMyRedemptions([]);
    }

    try {
      const referralsData = await getJSON(API.myReferrals);
      renderMyReferrals(referralsData);
    } catch (err) {
      console.error("Erro ao carregar indicações:", err);
      renderMyReferrals({ summary: {}, items: [] });
    }

    document.querySelectorAll(".club-nav-link").forEach(btn => {
      btn.addEventListener("click", function () {
        const page = this.dataset.page;
        document.querySelectorAll(".club-nav-link").forEach(b => b.classList.remove("active"));
        this.classList.add("active");

        document.querySelectorAll(".club-page").forEach(section => section.classList.remove("active"));
        const target = document.getElementById("page-" + page);
        if (target) target.classList.add("active");
      });
    });

    const logoutBtn = document.getElementById("club-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try {
          await postJSON(API.logout, {});
        } catch (_) {}
        window.location.href = "/clube/login.html";
      });
    }
  }

  initLoginPage();
  initDashboardPage();
})();
