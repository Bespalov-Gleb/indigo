(function () {
  "use strict";

  var DEFAULT_ADDONS = {
    payments: {
      enabled: true,
      mode: "once",
      label: "Платежи",
      price: 90000,
      weeks: 2,
      summaryName: "платежи",
    },
    admin: {
      enabled: true,
      mode: "qty",
      label: "Админ-панель",
      price: 120000,
      weeks: 3,
      summaryName: "админ",
    },
    integrations: {
      enabled: true,
      mode: "qty",
      label: "Интеграции (CRM, API)",
      price: 150000,
      weeks: 3,
      summaryName: "интеграции",
    },
  };

  function cloneAddonsTemplate() {
    return JSON.parse(JSON.stringify(DEFAULT_ADDONS));
  }

  var DEFAULT_CALC = {
    version: 1,
    maxAddonQty: 12,
    types: [
      {
        id: "landing",
        label: "Лендинг / маркетинговый сайт",
        min: 120000,
        max: 280000,
        weeksMin: 3,
        weeksMax: 8,
        enabled: true,
        addons: cloneAddonsTemplate(),
      },
      {
        id: "webapp",
        label: "Веб-сервис / личный кабинет",
        min: 350000,
        max: 1200000,
        weeksMin: 8,
        weeksMax: 24,
        enabled: true,
        addons: cloneAddonsTemplate(),
      },
      {
        id: "bot",
        label: "Telegram / чат-бот",
        min: 80000,
        max: 320000,
        weeksMin: 2,
        weeksMax: 10,
        enabled: true,
        addons: cloneAddonsTemplate(),
      },
      {
        id: "mobile",
        label: "Мобильное приложение",
        min: 450000,
        max: 1800000,
        weeksMin: 10,
        weeksMax: 28,
        enabled: true,
        addons: cloneAddonsTemplate(),
      },
    ],
    addons: {},
  };

  var loadedCalcConfig = null;

  function normalizeCalcConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.types)) return;
    var root = cfg.addons && typeof cfg.addons === "object" && Object.keys(cfg.addons).length ? cfg.addons : DEFAULT_ADDONS;
    cfg.types.forEach(function (t) {
      if (!t.addons || typeof t.addons !== "object") {
        t.addons = JSON.parse(JSON.stringify(root));
      }
    });
  }

  var calcState = {
    TYPE_BASE: {},
    TYPE_LABELS: {},
    EXTRA: {},
    MAX_ADDON_QTY: 12,
    addonSummaryNames: { payments: "платежи", admin: "админ", integrations: "интеграции" },
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qtyOfRow(row) {
    if (!row || !row.classList.contains("is-open")) return 0;
    var c = row.querySelector(".addon__count");
    return c ? parseInt(c.textContent, 10) || 0 : 0;
  }

  function addonMultByKey(key) {
    var row = document.querySelector('[data-addon="' + key + '"]');
    if (!row || row.style.display === "none") return 0;
    if (row.classList.contains("addon--once")) {
      return row.classList.contains("is-active") ? 1 : 0;
    }
    return qtyOfRow(row);
  }

  function getAddonMults() {
    var out = {};
    Object.keys(calcState.EXTRA || {}).forEach(function (key) {
      out[key] = addonMultByKey(key);
    });
    return out;
  }

  function applyExtra(mult, key) {
    var add = calcState.EXTRA[key];
    if (!add || mult <= 0) return { dMinP: 0, dMaxP: 0, dMinW: 0, dMaxW: 0 };
    return {
      dMinP: add.price * mult,
      dMaxP: add.price * mult,
      dMinW: add.weeks * mult,
      dMaxW: add.weeks * mult,
    };
  }

  function pulse(node) {
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.classList.remove("is-pulse");
    void node.offsetWidth;
    node.classList.add("is-pulse");
    window.clearTimeout(node._pulseT);
    node._pulseT = window.setTimeout(function () {
      node.classList.remove("is-pulse");
    }, 450);
  }

  var el = {
    type: document.getElementById("calc-type"),
    typeDisplay: document.getElementById("calc-type-display"),
    typeTrigger: document.getElementById("calc-type-trigger"),
    typePanel: document.getElementById("calc-type-panel"),
    typeWrap: document.getElementById("calc-type-wrap"),
    price: document.getElementById("calc-price"),
    time: document.getElementById("calc-time"),
    modal: document.getElementById("modal"),
    form: document.getElementById("lead-form"),
    estimate: document.getElementById("form-estimate"),
    error: document.getElementById("form-error"),
    success: document.getElementById("form-success"),
  };

  function formatRub(n) {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function formatWeeksSingle(w) {
    var n = Math.max(1, Math.round(w));
    var mod10 = n % 10;
    var mod100 = n % 100;
    var word = "недель";
    if (mod10 === 1 && mod100 !== 11) word = "неделя";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "недели";
    return n + " " + word;
  }

  function compute() {
    if (!el.type || !el.price || !el.time) return null;
    var t = el.type.value;
    var base = calcState.TYPE_BASE[t];
    if (!base) return null;

    // Simple model: base type cost/time + selected addon cost/time
    var totalP = base.min;
    var totalW = base.weeksMin;

    var st = getAddonMults();
    Object.keys(st).forEach(function (key) {
      var e = applyExtra(st[key], key);
      totalP += e.dMinP;
      totalW += e.dMinW;
    });

    var singleP = Math.round(totalP);
    var singleW = Math.round(totalW);

    el.price.textContent = formatRub(singleP);
    el.time.textContent = formatWeeksSingle(singleW);
    pulse(el.price);
    pulse(el.time);

    return {
      type: t,
      addons: st,
      singleP: singleP,
      singleW: singleW,
      minP: singleP,
      maxP: singleP,
      minW: singleW,
      maxW: singleW,
    };
  }

  function estimateSummary(data) {
    var parts = ["Тип: " + (calcState.TYPE_LABELS[data.type] || data.type)];
    var adds = [];
    Object.keys(data.addons || {}).forEach(function (key) {
      var qty = data.addons[key] || 0;
      if (qty <= 0) return;
      var name = calcState.addonSummaryNames[key] || key;
      adds.push(qty > 1 ? name + "×" + qty : name);
    });
    if (adds.length) parts.push("Доп: " + adds.join(", "));
    parts.push("Бюджет: " + formatRub(data.singleP));
    parts.push("Срок: " + formatWeeksSingle(data.singleW));
    return parts.join(" · ");
  }

  function openModal(fromCalculator) {
    if (!el.modal) return;
    el.modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (fromCalculator) {
      var data = compute();
      if (data && el.estimate) el.estimate.value = estimateSummary(data);
    }
    var first = el.form ? el.form.querySelector("textarea, input") : null;
    if (first) first.focus();
  }

  function closeModal() {
    if (!el.modal) return;
    el.modal.hidden = true;
    document.body.style.overflow = "";
    if (el.error) el.error.hidden = true;
    if (el.form) {
      el.form.hidden = false;
      el.form.reset();
    }
    if (el.success) el.success.hidden = true;
    if (el.estimate) el.estimate.value = "";
  }

  function hasContact(form) {
    var email = form.email.value.trim();
    var tg = form.telegram.value.trim();
    var vk = form.vk.value.trim();
    return Boolean(email || tg || vk);
  }

  function closeTypePanel() {
    if (!el.typePanel || !el.typeTrigger) return;
    el.typePanel.hidden = true;
    el.typeTrigger.setAttribute("aria-expanded", "false");
    el.typeWrap.classList.remove("is-open");
  }

  function openTypePanel() {
    el.typePanel.hidden = false;
    el.typeTrigger.setAttribute("aria-expanded", "true");
    el.typeWrap.classList.add("is-open");
  }

  function toggleTypePanel() {
    if (el.typePanel.hidden) openTypePanel();
    else closeTypePanel();
  }

  function selectTypeOption(value) {
    if (!calcState.TYPE_BASE[value]) return;
    el.type.value = value;
    el.typeDisplay.textContent = calcState.TYPE_LABELS[value] || value;
    el.typePanel.querySelectorAll(".custom-select__option").forEach(function (opt) {
      var sel = opt.getAttribute("data-value") === value;
      opt.classList.toggle("is-selected", sel);
      opt.setAttribute("aria-selected", sel ? "true" : "false");
    });
    closeTypePanel();
    applyAddonsForCurrentType();
    compute();
  }

  function applyAddonsForCurrentType() {
    if (!loadedCalcConfig || !el.type) return;
    var tid = el.type.value;
    var add = null;
    var types = loadedCalcConfig.types || [];
    for (var i = 0; i < types.length; i++) {
      if (types[i].id === tid && types[i].addons && typeof types[i].addons === "object") {
        add = types[i].addons;
        break;
      }
    }
    if (!add) add = (loadedCalcConfig.addons && Object.keys(loadedCalcConfig.addons).length && loadedCalcConfig.addons) || DEFAULT_ADDONS;
    syncAddonDom({ addons: add });
    calcState.EXTRA = {};
    calcState.addonSummaryNames = {};
    Object.keys(add || {}).forEach(function (key) {
      var a = add[key];
      if (!a) return;
      calcState.EXTRA[key] = { price: a.price, weeks: a.weeks };
      calcState.addonSummaryNames[key] = a.summaryName || key;
    });
  }

  function addonMarkupOnce() {
    return (
      '<div class="addon__main">' +
      '<span class="addon__name"></span>' +
      '<span class="addon__type mono">разово</span>' +
      "</div>" +
      '<div class="addon__side">' +
      '<button type="button" class="addon__btn addon__add" aria-label="Добавить">+</button>' +
      '<span class="addon__done" aria-hidden="true">✓</span>' +
      '<button type="button" class="addon__btn addon__clear" aria-label="Убрать">×</button>' +
      "</div>"
    );
  }

  function addonMarkupQty() {
    return (
      '<div class="addon__main">' +
      '<span class="addon__name"></span>' +
      '<span class="addon__type mono">количество</span>' +
      "</div>" +
      '<div class="addon__side">' +
      '<button type="button" class="addon__btn addon__open-qty" aria-label="Добавить">+</button>' +
      '<div class="addon__stepper">' +
      '<button type="button" class="addon__btn addon__dec" aria-label="Меньше">−</button>' +
      '<span class="addon__count mono">1</span>' +
      '<button type="button" class="addon__btn addon__inc" aria-label="Больше">+</button>' +
      "</div></div>"
    );
  }

  function syncAddonDom(cfg) {
    var list = document.getElementById("calc-addons-list");
    if (!list) return;
    var addons = (cfg && cfg.addons) || {};
    list.innerHTML = "";
    Object.keys(addons).forEach(function (key) {
      var a = addons[key];
      if (!a || a.enabled === false) return;
      var mode = a.mode === "once" ? "once" : "qty";
      var row = document.createElement("div");
      row.className = "addon " + (mode === "once" ? "addon--once" : "addon--qty");
      row.setAttribute("data-addon", key);
      row.innerHTML = mode === "once" ? addonMarkupOnce() : addonMarkupQty();
      var nameEl = row.querySelector(".addon__name");
      if (nameEl) nameEl.textContent = a.label || key;
      list.appendChild(row);
    });
  }

  function bindAddonDelegation() {
    var wrap = document.querySelector(".field.field--addons");
    if (!wrap || wrap.dataset.addonBound) return;
    wrap.dataset.addonBound = "1";
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var row = btn.closest("[data-addon]");
      if (!row || row.style.display === "none") return;

      if (btn.classList.contains("addon__add")) {
        row.classList.add("is-active");
        compute();
        return;
      }
      if (btn.classList.contains("addon__clear")) {
        row.classList.remove("is-active");
        compute();
        return;
      }
      if (btn.classList.contains("addon__open-qty")) {
        row.classList.add("is-open");
        var c0 = row.querySelector(".addon__count");
        if (c0) c0.textContent = "1";
        compute();
        return;
      }
      var countEl = row.querySelector(".addon__count");
      if (!countEl) return;
      if (btn.classList.contains("addon__dec")) {
        var n = parseInt(countEl.textContent, 10) || 1;
        if (n <= 1) {
          row.classList.remove("is-open");
          countEl.textContent = "1";
        } else {
          countEl.textContent = String(n - 1);
        }
        compute();
        return;
      }
      if (btn.classList.contains("addon__inc")) {
        var n2 = parseInt(countEl.textContent, 10) || 1;
        if (n2 < calcState.MAX_ADDON_QTY) countEl.textContent = String(n2 + 1);
        compute();
      }
    });
  }

  function syncTypePanel() {
    if (!el.typePanel) return;
    var ids = Object.keys(calcState.TYPE_BASE);
    el.typePanel.innerHTML = ids
      .map(function (id, i) {
        var sel = i === 0 ? " is-selected" : "";
        var ar = i === 0 ? "true" : "false";
        return (
          '<li class="custom-select__option' +
          sel +
          '" role="option" tabindex="-1" data-value="' +
          escapeHtml(id) +
          '" aria-selected="' +
          ar +
          '">' +
          escapeHtml(calcState.TYPE_LABELS[id]) +
          "</li>"
        );
      })
      .join("");

    var current = el.type.value;
    if (!calcState.TYPE_BASE[current]) current = ids[0];
    if (current) {
      el.type.value = current;
      el.typeDisplay.textContent = calcState.TYPE_LABELS[current];
      el.typePanel.querySelectorAll(".custom-select__option").forEach(function (opt) {
        var v = opt.getAttribute("data-value");
        var sel = v === current;
        opt.classList.toggle("is-selected", sel);
        opt.setAttribute("aria-selected", sel ? "true" : "false");
      });
    }
  }

  function applyCalcConfig(cfg) {
    loadedCalcConfig = cfg;
    normalizeCalcConfig(loadedCalcConfig);
    calcState.MAX_ADDON_QTY = cfg.maxAddonQty != null ? cfg.maxAddonQty : 12;
    calcState.TYPE_BASE = {};
    calcState.TYPE_LABELS = {};
    (cfg.types || []).forEach(function (t) {
      if (t.enabled === false) return;
      calcState.TYPE_BASE[t.id] = {
        min: t.min,
        max: t.max,
        weeksMin: t.weeksMin,
        weeksMax: t.weeksMax,
      };
      calcState.TYPE_LABELS[t.id] = t.label;
    });
    syncTypePanel();
    if (el.type && el.type.value && !calcState.TYPE_BASE[el.type.value]) {
      var first = Object.keys(calcState.TYPE_BASE)[0];
      if (first) selectTypeOption(first);
    } else if (el.type && el.price && el.time) {
      applyAddonsForCurrentType();
      compute();
    }
  }

  async function loadCalcConfig() {
    try {
      var r = await fetch("/site/data/calculator.json", { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch (e) {}
    return DEFAULT_CALC;
  }

  bindAddonDelegation();

  if (el.typeTrigger && el.typePanel) {
    el.typeTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleTypePanel();
    });
    el.typePanel.addEventListener("click", function (e) {
      var opt = e.target.closest(".custom-select__option");
      if (!opt) return;
      selectTypeOption(opt.getAttribute("data-value"));
    });
    document.addEventListener("click", function () {
      closeTypePanel();
    });
    el.typeWrap.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  loadCalcConfig().then(applyCalcConfig);

  document.querySelectorAll("[data-open-modal]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var fromCalc = btn.id === "calc-request";
      openModal(fromCalc);
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach(function (node) {
    node.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (el.modal && !el.modal.hidden) {
      closeModal();
      return;
    }
    if (el.typeWrap && el.typeWrap.classList.contains("is-open")) {
      closeTypePanel();
      if (el.typeTrigger) el.typeTrigger.focus();
    }
  });

  if (el.form) {
    el.form.addEventListener("submit", function (e) {
      e.preventDefault();
      el.error.hidden = true;
      if (!el.form.description.value.trim()) {
        el.form.description.focus();
        return;
      }
      if (!hasContact(el.form)) {
        el.error.hidden = false;
        return;
      }
      el.form.hidden = true;
      el.success.hidden = false;
    });
  }

  function setupRevealObserver() {
    if (window.__indigoRevealObs) return window.__indigoRevealObs;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return null;
    window.__indigoRevealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            window.__indigoRevealObs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    return window.__indigoRevealObs;
  }

  window.indigoObserveReveals = function (root) {
    var scope = root || document;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      scope.querySelectorAll("[data-reveal]").forEach(function (r) {
        r.classList.add("is-visible");
      });
      return;
    }
    var obs = setupRevealObserver();
    if (!obs) return;
    scope.querySelectorAll("[data-reveal]:not(.is-visible)").forEach(function (r) {
      obs.observe(r);
    });
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    window.indigoObserveReveals(document);
  } else {
    document.querySelectorAll("[data-reveal]").forEach(function (r) {
      r.classList.add("is-visible");
    });
  }

  var pfBar = document.getElementById("pf-filters");
  if (pfBar) {
    pfBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-pf-filter]");
      if (!btn || btn.disabled) return;
      var f = btn.getAttribute("data-pf-filter");
      pfBar.querySelectorAll("[data-pf-filter]").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      document.querySelectorAll(".pf-item").forEach(function (item) {
        var cat = item.getAttribute("data-category");
        var show = f === "all" || cat === f;
        item.classList.toggle("is-hidden", !show);
      });
    });
  }
})();
