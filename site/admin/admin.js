(function () {
  "use strict";

  var TOKEN_KEY = "indigo_admin_token";
  var calcState = null;
  var portfolioState = null;
  var pfEditingSlug = null;

  function $(id) {
    return document.getElementById(id);
  }

  function showToast(text, ok) {
    var el = $("admin-toast");
    el.textContent = text;
    el.className = "admin-msg " + (ok ? "admin-msg--ok" : "admin-msg--err");
    el.hidden = false;
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      el.hidden = true;
    }, 5000);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    var t = getToken();
    return t
      ? { Authorization: "Bearer " + t, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  async function apiLogin(password) {
    var r;
    try {
      r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password }),
      });
    } catch (e) {
      var ne = new Error("network");
      ne.code = "network";
      throw ne;
    }
    if (r.status === 404) {
      var nf = new Error("no_api");
      nf.code = "no_api";
      throw nf;
    }
    var data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      var le = new Error(data.error || "login_failed");
      le.code = r.status === 401 ? "bad_password" : "login_failed";
      throw le;
    }
    if (!data.token) {
      var nt = new Error("no_token");
      nt.code = "no_token";
      throw nt;
    }
    return data.token;
  }

  async function loadAdminDataAfterLogin() {
    try {
      await refreshCalculatorForm();
    } catch (e) {
      showToast(
        "Калькулятор не загрузился (/site/data/calculator.json). Проверьте файл и что открыли сайт по HTTP, не file://",
        false
      );
      calcState = { version: 1, roundingRub: 10000, maxAddonQty: 12, types: [], addons: {} };
      $("roundingRub").value = 10000;
      $("maxAddonQty").value = 12;
      renderCalcTypes([]);
    }
    try {
      portfolioState = deepClone(await loadPortfolio());
    } catch (e) {
      showToast("Портфолио не загрузилось (/site/data/portfolio.json).", false);
      portfolioState = { version: 1, order: [], homeSlugs: [], cases: {} };
    }
    syncPortfolioJsonField();
    renderPfList();
    renderPfHome();
  }

  async function loadCalculator() {
    var r = await fetch("/site/data/calculator.json", { cache: "no-store" });
    if (!r.ok) throw new Error("calc_load");
    return r.json();
  }

  async function saveCalculator(body) {
    var r = await fetch("/api/admin/calculator", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.status === 401) throw new Error("unauthorized");
    if (!r.ok) throw new Error("calc_save");
  }

  async function loadPortfolio() {
    var r = await fetch("/site/data/portfolio.json", { cache: "no-store" });
    if (!r.ok) throw new Error("pf_load");
    return r.json();
  }

  async function savePortfolio(body) {
    var r = await fetch("/api/admin/portfolio", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (r.status === 401) throw new Error("unauthorized");
    if (!r.ok) throw new Error("pf_save");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  var SLUG_RE = /^[a-z][a-z0-9-]*$/;

  var ADMIN_DEFAULT_ADDONS = {
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

  function renderTypeAddonsHtml(addons) {
    var a0 = addons && typeof addons === "object" ? addons : {};
    var keys = Object.keys(a0);
    return (
      '<div class="admin-calc-type-addons">' +
      '<div class="admin-section__row"><h3 class="admin-calc-type-addons__title">Дополнительные опции</h3><button type="button" class="admin-chip-btn admin-chip-btn--small calc-addon-add">+ Опция</button></div>' +
      '<p class="admin-hint admin-calc-type-addons__hint">Опции привязаны к <strong>этому</strong> типу. ID: латиница/цифры/дефис (например <span class="mono">payments</span>).</p>' +
      keys.map(function (key) {
        var a = a0[key] || {};
        var once = a.mode !== "qty";
        return (
          '<fieldset class="admin-fieldset admin-fieldset--nested-addon" data-calc-addon="' +
          esc(key) +
          '">' +
          '<legend class="admin-calc-addon-legend"><code>' +
          esc(key) +
          '</code><button type="button" class="calc-addon-remove" title="Удалить опцию" aria-label="Удалить опцию">×</button></legend>' +
          '<label class="admin-field label inline" style="margin-bottom:0.75rem"><input type="checkbox" data-field="enabled" ' +
          (a.enabled !== false ? "checked" : "") +
          " /> показывать</label>" +
          '<div class="admin-grid admin-grid--2">' +
          '<div class="admin-field"><label>Режим</label><select data-field="mode">' +
          '<option value="once"' +
          (once ? " selected" : "") +
          ">Разово</option>" +
          '<option value="qty"' +
          (!once ? " selected" : "") +
          ">По количеству</option></select></div>" +
          '<div class="admin-field"></div>' +
          '<div class="admin-field"><label>Подпись</label><input type="text" data-field="label" value="' +
          esc(a.label || "") +
          '" /></div>' +
          '<div class="admin-field"><label>В заявке (кратко)</label><input type="text" data-field="summaryName" value="' +
          esc(a.summaryName || "") +
          '" /></div>' +
          '<div class="admin-field"><label>Цена единицы (₽)</label><input type="number" data-field="price" value="' +
          esc(a.price != null ? a.price : "") +
          '" /></div>' +
          '<div class="admin-field"><label>Недель на единицу</label><input type="number" data-field="weeks" value="' +
          esc(a.weeks != null ? a.weeks : "") +
          '" /></div>' +
          "</div></fieldset>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderCalcTypes(types) {
    var mount = $("calc-types-mount");
    var list = types || [];
    mount.innerHTML = list
      .map(function (t, i) {
        var en = t.enabled !== false;
        var canDel = list.length > 1;
        var typeAddons = t.addons && typeof t.addons === "object" ? t.addons : deepClone(ADMIN_DEFAULT_ADDONS);
        return (
          '<fieldset class="admin-fieldset admin-calc-type">' +
          '<legend class="admin-calc-legend"><span class="admin-calc-legend__inner">' +
          '<span class="admin-calc-legend__title">Тип продукта</span>' +
          '<button type="button" class="calc-type-remove" data-index="' +
          i +
          '"' +
          (canDel ? "" : " disabled") +
          ' title="Удалить тип" aria-label="Удалить тип">' +
          '<span class="calc-type-remove__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M8 6V4h8v2m5 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6m4-6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
          "<span>Удалить</span></button></span></legend>" +
          '<div class="admin-calc-type__top">' +
          '<div class="admin-field"><label>ID</label><input type="text" data-field="id" value="' +
          esc(t.id) +
          '" spellcheck="false" /></div>' +
          '<div class="admin-field admin-field--calc-enabled"><span class="admin-field__fake-label">Видимость</span><label class="inline"><input type="checkbox" data-field="enabled" ' +
          (en ? "checked" : "") +
          " /> Показывать в калькуляторе</label></div></div>" +
          '<div class="admin-grid admin-grid--2">' +
          '<div class="admin-field admin-field--full"><label>Название в списке</label><input type="text" data-field="label" value="' +
          esc(t.label) +
          '" /></div>' +
          '<div class="admin-field"><label>Мин. бюджет (₽)</label><input type="number" data-field="min" value="' +
          esc(t.min) +
          '" /></div>' +
          '<div class="admin-field"><label>Макс. бюджет (₽)</label><input type="number" data-field="max" value="' +
          esc(t.max) +
          '" /></div>' +
          '<div class="admin-field"><label>Мин. недель</label><input type="number" data-field="weeksMin" value="' +
          esc(t.weeksMin) +
          '" /></div>' +
          '<div class="admin-field"><label>Макс. недель</label><input type="number" data-field="weeksMax" value="' +
          esc(t.weeksMax) +
          '" /></div>' +
          "</div>" +
          renderTypeAddonsHtml(typeAddons) +
          "</fieldset>"
        );
      })
      .join("");
  }

  function collectCalculator() {
    var types = [];
    document.querySelectorAll(".admin-calc-type").forEach(function (fs) {
      function get(field) {
        var inp =
          fs.querySelector('.admin-calc-type__top [data-field="' + field + '"]') ||
          fs.querySelector(':scope > .admin-grid [data-field="' + field + '"]');
        if (!inp) return null;
        if (inp.type === "checkbox") return inp.checked;
        if (inp.type === "number") return parseFloat(inp.value) || 0;
        return inp.value.trim();
      }
      var addons = {};
      fs.querySelectorAll(".admin-calc-type-addons [data-calc-addon]").forEach(function (afs) {
        var key = afs.getAttribute("data-calc-addon");
        function aget(field) {
          var inp = afs.querySelector('[data-field="' + field + '"]');
          if (!inp) return null;
          if (inp.type === "checkbox") return inp.checked;
          if (inp.type === "number") return parseFloat(inp.value) || 0;
          if (inp.tagName === "SELECT") return inp.value;
          return inp.value.trim();
        }
        addons[key] = {
          enabled: aget("enabled"),
          mode: aget("mode") === "qty" ? "qty" : "once",
          label: aget("label"),
          summaryName: aget("summaryName"),
          price: aget("price"),
          weeks: aget("weeks"),
        };
      });
      types.push({
        id: get("id"),
        label: get("label"),
        min: get("min"),
        max: get("max"),
        weeksMin: get("weeksMin"),
        weeksMax: get("weeksMax"),
        enabled: get("enabled"),
        addons: addons,
      });
    });
    for (var ti = 0; ti < types.length; ti++) {
      if (!types[ti].id || !SLUG_RE.test(types[ti].id)) {
        showToast("Некорректный ID типа (латиница, цифры, дефис): «" + (types[ti].id || "") + "»", false);
        return null;
      }
      var addonKeys = Object.keys(types[ti].addons || {});
      for (var ak = 0; ak < addonKeys.length; ak++) {
        if (!SLUG_RE.test(addonKeys[ak])) {
          showToast("Некорректный ID доп. опции: " + addonKeys[ak], false);
          return null;
        }
      }
    }

    var seen = {};
    for (var i = 0; i < types.length; i++) {
      if (seen[types[i].id]) {
        showToast("Дублируется ID типа: " + types[i].id, false);
        return null;
      }
      seen[types[i].id] = true;
    }

    if (!types.length) {
      showToast("Нужен хотя бы один тип продукта.", false);
      return null;
    }

    return {
      version: (calcState && calcState.version) || 1,
      roundingRub: parseInt($("roundingRub").value, 10) || 10000,
      maxAddonQty: parseInt($("maxAddonQty").value, 10) || 12,
      types: types,
      addons: {},
    };
  }

  async function refreshCalculatorForm() {
    calcState = await loadCalculator();
    $("roundingRub").value = calcState.roundingRub != null ? calcState.roundingRub : 10000;
    $("maxAddonQty").value = calcState.maxAddonQty != null ? calcState.maxAddonQty : 12;
    var rootA = calcState.addons && typeof calcState.addons === "object" ? calcState.addons : null;
    (calcState.types || []).forEach(function (t) {
      if (!t.addons || typeof t.addons !== "object") {
        t.addons = deepClone(rootA && Object.keys(rootA).length ? rootA : ADMIN_DEFAULT_ADDONS);
      }
    });
    renderCalcTypes(calcState.types);
  }

  function switchTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
  }

  function showApp(show) {
    $("admin-login").hidden = show;
    $("admin-app").hidden = !show;
  }

  function emptyCase() {
    return {
      title: "Новый проект",
      tag: "web",
      category: "web",
      stack: "",
      excerpt: "",
      mediaVariant: "",
      meta: [],
      lead: "",
      gallery: [],
      video: null,
      links: [],
    };
  }

  function syncPortfolioJsonField() {
    if ($("portfolio-json") && portfolioState) {
      $("portfolio-json").value = JSON.stringify(portfolioState, null, 2);
    }
  }

  function renderPfList() {
    var ul = $("pf-list");
    if (!ul || !portfolioState) return;
    var order = portfolioState.order || [];
    ul.innerHTML = order
      .map(function (slug) {
        var c = (portfolioState.cases || {})[slug];
        var title = c && c.title ? c.title : slug;
        var active = slug === pfEditingSlug ? " is-active" : "";
        return (
          '<li class="admin-pf-row">' +
          '<button type="button" class="admin-pf-item' +
          active +
          '" data-pf-open="' +
          esc(slug) +
          '">' +
          '<span class="admin-pf-item__title">' +
          esc(title) +
          "</span>" +
          '<span class="admin-pf-item__slug">' +
          esc(slug) +
          "</span></button>" +
          '<div class="admin-pf-item__actions">' +
          '<button type="button" data-pf-up="' +
          esc(slug) +
          '" title="Выше">↑</button>' +
          '<button type="button" data-pf-down="' +
          esc(slug) +
          '" title="Ниже">↓</button>' +
          "</div></li>"
        );
      })
      .join("");
  }

  function renderPfHome() {
    var ul = $("pf-home-slugs");
    var sel = $("pf-add-home");
    if (!ul || !sel || !portfolioState) return;
    var hs = portfolioState.homeSlugs || [];
    ul.innerHTML = hs
      .map(function (slug, idx) {
        return (
          '<li class="admin-pf-homeitem"><span>' +
          esc(slug) +
          '</span><button type="button" data-pf-home-up="' +
          idx +
          '">↑</button><button type="button" data-pf-home-down="' +
          idx +
          '">↓</button><button type="button" data-pf-home-remove="' +
          idx +
          '">×</button></li>'
        );
      })
      .join("");

    var order = portfolioState.order || [];
    var opts = '<option value="">— выберите проект —</option>';
    order.forEach(function (slug) {
      if (hs.indexOf(slug) >= 0) return;
      opts += '<option value="' + esc(slug) + '">' + esc(slug) + "</option>";
    });
    sel.innerHTML = opts;
  }

  function openPfEditor(slug) {
    if (!portfolioState || !portfolioState.cases || !portfolioState.cases[slug]) return;
    pfEditingSlug = slug;
    var c = deepClone(portfolioState.cases[slug]);
    $("pf-placeholder").hidden = true;
    $("pf-editor").hidden = false;
    $("pf-editor-title").textContent = c.title || slug;
    $("pf-slug").value = slug;
    $("pf-title").value = c.title || "";
    $("pf-tag").value = c.tag || "";
    $("pf-category").value = c.category || c.tag || "web";
    $("pf-stack").value = c.stack || "";
    $("pf-excerpt").value = c.excerpt || "";
    $("pf-media").value = c.mediaVariant != null ? c.mediaVariant : "";
    $("pf-lead").value = c.lead || "";

    var meta = c.meta || [];
    $("pf-meta-rows").innerHTML = meta
      .map(function (m) {
        return (
          '<div class="admin-repeat-row"><div class="admin-field"><input type="text" data-pf-meta value="' +
          esc(m) +
          '" placeholder="текст" /></div><button type="button" class="admin-repeat-row__remove" data-pf-meta-remove>×</button></div>'
        );
      })
      .join("");

    var gal = c.gallery || [];
    $("pf-gallery-rows").innerHTML = gal
      .map(function (g) {
        return (
          '<div class="admin-repeat-row admin-repeat-row--gal">' +
          '<div class="admin-field"><label>Вариант</label><select data-pf-gal-var>' +
          ["", "b", "c", "d", "e", "f", "g", "h"]
            .map(function (v) {
              return (
                "<option value=\"" +
                esc(v) +
                '"' +
                (g.variant === v ? " selected" : "") +
                ">" +
                (v || "базовый") +
                "</option>"
              );
            })
            .join("") +
          "</select></div>" +
          '<div class="admin-field"><label>Подпись</label><input type="text" data-pf-gal-cap value="' +
          esc(g.caption || "") +
          '" /></div>' +
          '<button type="button" class="admin-repeat-row__remove" data-pf-gal-remove>×</button></div>'
        );
      })
      .join("");

    var vid = c.video;
    var hasVid = !!(vid && vid.youtube);
    $("pf-video-on").checked = hasVid;
    $("pf-video-id").value = hasVid ? vid.youtube : "";
    $("pf-video-note").value = hasVid && vid.note ? vid.note : "";
    $("pf-video-fields").style.opacity = hasVid ? "1" : "0.45";
    $("pf-video-fields").style.pointerEvents = hasVid ? "" : "none";

    var links = c.links || [];
    $("pf-link-rows").innerHTML = links
      .map(function (l) {
        return (
          '<div class="admin-repeat-row admin-repeat-row--link">' +
          '<div class="admin-field"><label>Текст</label><input type="text" data-pf-link-lab value="' +
          esc(l.label || "") +
          '" /></div>' +
          '<div class="admin-field"><label>URL</label><input type="text" data-pf-link-href value="' +
          esc(l.href || "") +
          '" /></div>' +
          '<label class="admin-field label inline" style="margin-bottom:0.25rem"><input type="checkbox" data-pf-link-ext ' +
          (l.external !== false ? "checked" : "") +
          " /> внешн.</label>" +
          '<button type="button" class="admin-repeat-row__remove" data-pf-link-remove>×</button></div>'
        );
      })
      .join("");

    renderPfList();
  }

  function closePfEditor() {
    pfEditingSlug = null;
    $("pf-placeholder").hidden = false;
    $("pf-editor").hidden = true;
    renderPfList();
  }

  function readCaseFromForm() {
    var slug = $("pf-slug").value.trim();
    if (!SLUG_RE.test(slug)) {
      showToast("Slug: латиница, с цифр или дефиса, например my-project", false);
      return null;
    }
    var meta = [];
    document.querySelectorAll("[data-pf-meta]").forEach(function (inp) {
      var v = inp.value.trim();
      if (v) meta.push(v);
    });
    var gallery = [];
    document.querySelectorAll(".admin-repeat-row--gal").forEach(function (row) {
      var v = row.querySelector("[data-pf-gal-var]");
      var cap = row.querySelector("[data-pf-gal-cap]");
      gallery.push({ variant: v ? v.value : "", caption: cap ? cap.value.trim() : "" });
    });
    var links = [];
    document.querySelectorAll(".admin-repeat-row--link").forEach(function (row) {
      var lab = row.querySelector("[data-pf-link-lab]");
      var href = row.querySelector("[data-pf-link-href]");
      var ext = row.querySelector("[data-pf-link-ext]");
      if (lab && href && (lab.value.trim() || href.value.trim())) {
        links.push({
          label: lab.value.trim(),
          href: href.value.trim(),
          external: ext ? ext.checked : true,
        });
      }
    });
    var video = null;
    if ($("pf-video-on").checked) {
      var yid = $("pf-video-id").value.trim();
      if (yid) {
        video = { youtube: yid, note: $("pf-video-note").value.trim() || undefined };
      }
    }
    return {
      slug: slug,
      case: {
        title: $("pf-title").value.trim(),
        tag: $("pf-tag").value.trim() || "web",
        category: $("pf-category").value || "web",
        stack: $("pf-stack").value.trim(),
        excerpt: $("pf-excerpt").value.trim(),
        mediaVariant: $("pf-media").value || "",
        meta: meta,
        lead: $("pf-lead").value.trim(),
        gallery: gallery,
        video: video,
        links: links,
      },
    };
  }

  function applyCaseFromForm(silent) {
    if (!portfolioState || !pfEditingSlug) return false;
    var data = readCaseFromForm();
    if (!data) return false;
    var oldSlug = pfEditingSlug;
    var newSlug = data.slug;
    if (newSlug !== oldSlug) {
      if (portfolioState.cases[newSlug]) {
        showToast("Такой slug уже занят.", false);
        return false;
      }
      delete portfolioState.cases[oldSlug];
      portfolioState.cases[newSlug] = data.case;
      var oi = portfolioState.order.indexOf(oldSlug);
      if (oi >= 0) portfolioState.order[oi] = newSlug;
      portfolioState.homeSlugs = (portfolioState.homeSlugs || []).map(function (s) {
        return s === oldSlug ? newSlug : s;
      });
      pfEditingSlug = newSlug;
    } else {
      portfolioState.cases[oldSlug] = data.case;
    }
    syncPortfolioJsonField();
    renderPfList();
    renderPfHome();
    $("pf-editor-title").textContent = data.case.title || newSlug;
    if (!silent) {
      showToast("Черновик обновлён. Не забудьте «Сохранить портфолио».", true);
    }
    return true;
  }

  function pfMoveOrder(slug, dir) {
    var o = portfolioState.order;
    var i = o.indexOf(slug);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= o.length) return;
    var t = o[i];
    o[i] = o[j];
    o[j] = t;
    syncPortfolioJsonField();
    renderPfList();
  }

  function pfHomeMove(idx, dir) {
    var hs = portfolioState.homeSlugs;
    var j = idx + dir;
    if (j < 0 || j >= hs.length) return;
    var t = hs[idx];
    hs[idx] = hs[j];
    hs[j] = t;
    syncPortfolioJsonField();
    renderPfHome();
  }

  function bind(id, ev, fn) {
    var el = $(id);
    if (!el) {
      console.error("INDIGO admin: не найден элемент #" + id);
      return;
    }
    el.addEventListener(ev, fn);
  }

  bind("admin-login-btn", "click", function () {
    doLogin();
  });
  bind("admin-password", "keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });

  bind("pf-list", "click", function (e) {
    var open = e.target.closest("[data-pf-open]");
    if (open) {
      openPfEditor(open.getAttribute("data-pf-open"));
      return;
    }
    var u = e.target.closest("[data-pf-up]");
    if (u) {
      pfMoveOrder(u.getAttribute("data-pf-up"), -1);
      return;
    }
    var d = e.target.closest("[data-pf-down]");
    if (d) pfMoveOrder(d.getAttribute("data-pf-down"), 1);
  });

  bind("pf-home-slugs", "click", function (e) {
    var u = e.target.closest("[data-pf-home-up]");
    if (u) {
      pfHomeMove(parseInt(u.getAttribute("data-pf-home-up"), 10), -1);
      return;
    }
    var d = e.target.closest("[data-pf-home-down]");
    if (d) {
      pfHomeMove(parseInt(d.getAttribute("data-pf-home-down"), 10), 1);
      return;
    }
    var r = e.target.closest("[data-pf-home-remove]");
    if (r) {
      var idx = parseInt(r.getAttribute("data-pf-home-remove"), 10);
      portfolioState.homeSlugs.splice(idx, 1);
      syncPortfolioJsonField();
      renderPfHome();
    }
  });

  bind("pf-add-home", "change", function () {
    var v = $("pf-add-home").value;
    if (!v) return;
    if (!portfolioState.homeSlugs) portfolioState.homeSlugs = [];
    if (portfolioState.homeSlugs.indexOf(v) < 0) portfolioState.homeSlugs.push(v);
    $("pf-add-home").value = "";
    syncPortfolioJsonField();
    renderPfHome();
  });

  bind("pf-video-on", "change", function () {
    var on = $("pf-video-on").checked;
    $("pf-video-fields").style.opacity = on ? "1" : "0.45";
    $("pf-video-fields").style.pointerEvents = on ? "" : "none";
  });

  bind("pf-meta-add", "click", function () {
    var wrap = document.createElement("div");
    wrap.className = "admin-repeat-row";
    wrap.innerHTML =
      '<div class="admin-field"><input type="text" data-pf-meta placeholder="текст" /></div><button type="button" class="admin-repeat-row__remove" data-pf-meta-remove>×</button>';
    $("pf-meta-rows").appendChild(wrap);
  });

  bind("pf-meta-rows", "click", function (e) {
    if (e.target.closest("[data-pf-meta-remove]")) {
      e.target.closest(".admin-repeat-row").remove();
    }
  });

  bind("pf-gallery-add", "click", function () {
    var wrap = document.createElement("div");
    wrap.className = "admin-repeat-row admin-repeat-row--gal";
    wrap.innerHTML =
      '<div class="admin-field"><label>Вариант</label><select data-pf-gal-var>' +
      ["", "b", "c", "d", "e", "f", "g", "h"]
        .map(function (v) {
          return '<option value="' + esc(v) + '">' + (v || "базовый") + "</option>";
        })
        .join("") +
      '</select></div><div class="admin-field"><label>Подпись</label><input type="text" data-pf-gal-cap /></div><button type="button" class="admin-repeat-row__remove" data-pf-gal-remove>×</button>';
    $("pf-gallery-rows").appendChild(wrap);
  });

  bind("pf-gallery-rows", "click", function (e) {
    if (e.target.closest("[data-pf-gal-remove]")) {
      e.target.closest(".admin-repeat-row").remove();
    }
  });

  bind("pf-link-add", "click", function () {
    var wrap = document.createElement("div");
    wrap.className = "admin-repeat-row admin-repeat-row--link";
    wrap.innerHTML =
      '<div class="admin-field"><label>Текст</label><input type="text" data-pf-link-lab /></div>' +
      '<div class="admin-field"><label>URL</label><input type="text" data-pf-link-href /></div>' +
      '<label class="admin-field label inline" style="margin-bottom:0.25rem"><input type="checkbox" data-pf-link-ext checked /> внешн.</label>' +
      '<button type="button" class="admin-repeat-row__remove" data-pf-link-remove>×</button>';
    $("pf-link-rows").appendChild(wrap);
  });

  bind("pf-link-rows", "click", function (e) {
    if (e.target.closest("[data-pf-link-remove]")) {
      e.target.closest(".admin-repeat-row").remove();
    }
  });

  bind("pf-back-list", "click", function () {
    applyCaseFromForm(true);
    closePfEditor();
  });

  bind("pf-apply-case", "click", function () {
    applyCaseFromForm(false);
  });

  bind("pf-delete-case", "click", function () {
    if (!pfEditingSlug || !portfolioState) return;
    if (!window.confirm("Удалить проект «" + pfEditingSlug + "»?")) return;
    delete portfolioState.cases[pfEditingSlug];
    portfolioState.order = (portfolioState.order || []).filter(function (s) {
      return s !== pfEditingSlug;
    });
    portfolioState.homeSlugs = (portfolioState.homeSlugs || []).filter(function (s) {
      return s !== pfEditingSlug;
    });
    syncPortfolioJsonField();
    closePfEditor();
    renderPfHome();
    showToast("Проект удалён из черновика. Сохраните портфолио.", true);
  });

  bind("pf-new", "click", function () {
    if (!portfolioState) return;
    var base = window.prompt("Slug нового проекта (латиница, дефисы):", "new-project");
    if (!base) return;
    base = base.trim().toLowerCase();
    if (!SLUG_RE.test(base)) {
      showToast("Некорректный slug.", false);
      return;
    }
    if (portfolioState.cases[base]) {
      showToast("Такой slug уже есть.", false);
      return;
    }
    portfolioState.cases[base] = emptyCase();
    portfolioState.order = portfolioState.order || [];
    portfolioState.order.push(base);
    syncPortfolioJsonField();
    renderPfHome();
    openPfEditor(base);
    showToast("Новый проект добавлен.", true);
  });

  bind("pf-save-all", "click", async function () {
    try {
      if (pfEditingSlug) applyCaseFromForm(true);
      var body;
      if (!$("pf-json-panel").hidden && $("portfolio-json").value.trim()) {
        body = JSON.parse($("portfolio-json").value);
      } else {
        body = portfolioState;
      }
      if (!body.cases || !Array.isArray(body.order)) {
        showToast("Некорректная структура портфолио.", false);
        return;
      }
      await savePortfolio(body);
      portfolioState = deepClone(body);
      syncPortfolioJsonField();
      renderPfList();
      renderPfHome();
      showToast("Портфолио сохранено на сервер.", true);
    } catch (e) {
      if (e.message === "unauthorized") {
        showToast("Войдите снова.", false);
        setToken("");
        showApp(false);
      } else if (e instanceof SyntaxError) {
        showToast("JSON: " + e.message, false);
      } else {
        showToast("Ошибка сохранения. npm start?", false);
      }
    }
  });

  bind("pf-reload", "click", async function () {
    try {
      portfolioState = await loadPortfolio();
      portfolioState = deepClone(portfolioState);
      syncPortfolioJsonField();
      closePfEditor();
      renderPfList();
      renderPfHome();
      showToast("Портфолио перезагружено.", true);
    } catch (e) {
      showToast("Не удалось загрузить portfolio.json", false);
    }
  });

  bind("pf-json-toggle", "click", function () {
    var p = $("pf-json-panel");
    var on = p.hidden;
    p.hidden = !on;
    $("pf-json-toggle").setAttribute("aria-expanded", on ? "true" : "false");
    if (on) syncPortfolioJsonField();
  });

  bind("portfolio-format", "click", function () {
    try {
      var obj = JSON.parse($("portfolio-json").value);
      $("portfolio-json").value = JSON.stringify(obj, null, 2);
      showToast("JSON отформатирован.", true);
    } catch (e) {
      showToast("Некорректный JSON.", false);
    }
  });

  bind("calc-types-mount", "click", function (e) {
    var rm = e.target.closest(".calc-type-remove");
    if (rm && !rm.disabled && calcState && calcState.types) {
      var idx = parseInt(rm.getAttribute("data-index"), 10);
      if (calcState.types.length <= 1) return;
      calcState.types.splice(idx, 1);
      renderCalcTypes(calcState.types);
      return;
    }

    var addAddonBtn = e.target.closest(".calc-addon-add");
    if (addAddonBtn && calcState && calcState.types) {
      var typeFs = addAddonBtn.closest(".admin-calc-type");
      if (!typeFs) return;
      var typeIdx = Array.prototype.indexOf.call(document.querySelectorAll(".admin-calc-type"), typeFs);
      if (typeIdx < 0 || !calcState.types[typeIdx]) return;
      var newKey = window.prompt("ID новой опции (латиница, цифры, дефис):", "new-addon");
      if (!newKey) return;
      newKey = newKey.trim().toLowerCase();
      if (!SLUG_RE.test(newKey)) {
        showToast("Некорректный ID опции.", false);
        return;
      }
      calcState.types[typeIdx].addons = calcState.types[typeIdx].addons || {};
      if (calcState.types[typeIdx].addons[newKey]) {
        showToast("Такая опция уже есть у этого типа.", false);
        return;
      }
      calcState.types[typeIdx].addons[newKey] = {
        enabled: true,
        mode: "once",
        label: "Новая опция",
        summaryName: newKey,
        price: 0,
        weeks: 0,
      };
      renderCalcTypes(calcState.types);
      return;
    }

    var rmAddonBtn = e.target.closest(".calc-addon-remove");
    if (rmAddonBtn && calcState && calcState.types) {
      var addonFs = rmAddonBtn.closest("[data-calc-addon]");
      var rootTypeFs = rmAddonBtn.closest(".admin-calc-type");
      if (!addonFs || !rootTypeFs) return;
      var tIdx = Array.prototype.indexOf.call(document.querySelectorAll(".admin-calc-type"), rootTypeFs);
      if (tIdx < 0 || !calcState.types[tIdx]) return;
      var key = addonFs.getAttribute("data-calc-addon");
      if (!key) return;
      delete calcState.types[tIdx].addons[key];
      renderCalcTypes(calcState.types);
    }
  });

  bind("calc-type-add", "click", function () {
    if (!calcState) calcState = { types: [] };
    if (!calcState.types) calcState.types = [];
    var id = "type-" + Date.now();
    var tmplAddons = deepClone(ADMIN_DEFAULT_ADDONS);
    if (calcState.types.length && calcState.types[0].addons && typeof calcState.types[0].addons === "object") {
      tmplAddons = deepClone(calcState.types[0].addons);
    }
    calcState.types.push({
      id: id,
      label: "Новый тип",
      min: 100000,
      max: 300000,
      weeksMin: 2,
      weeksMax: 8,
      enabled: true,
      addons: tmplAddons,
    });
    renderCalcTypes(calcState.types);
  });

  function showLoginError(e) {
    var err = $("admin-login-err");
    err.hidden = false;
    if (e && e.code === "network") {
      err.textContent =
        "Браузер не достучался до сервера. Откройте админку по ссылке с localhost (например http://127.0.0.1:8787/site/admin/), не как файл с диска.";
    } else if (e && e.code === "no_api") {
      err.textContent =
        "Этот сервер не отдаёт API входа. В корне проекта выполните npm start и откройте http://127.0.0.1:8787/site/admin/ — обычный npx serve здесь не подходит.";
    } else if (e && e.code === "bad_password") {
      err.textContent = "Неверный пароль. По умолчанию: admin (или значение ADMIN_PASSWORD).";
    } else {
      err.textContent = "Вход не удался. Обновите страницу и попробуйте снова.";
    }
  }

  async function doLogin() {
    var pw = $("admin-password").value;
    var err = $("admin-login-err");
    var btn = $("admin-login-btn");
    var prevLabel = btn ? btn.textContent : "";
    err.hidden = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Вход…";
    }
    try {
      var token = await apiLogin(pw);
      setToken(token);
      showApp(true);
      await loadAdminDataAfterLogin();
    } catch (e) {
      showLoginError(e);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || "Войти";
      }
    }
  }

  bind("admin-logout", "click", async function () {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
    } catch (e) {}
    setToken("");
    showApp(false);
    $("admin-password").value = "";
  });

  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      switchTab(b.getAttribute("data-tab"));
    });
  });

  bind("calc-save", "click", async function () {
    var payload = collectCalculator();
    if (!payload) return;
    try {
      await saveCalculator(payload);
      calcState = payload;
      showToast("Калькулятор сохранён.", true);
    } catch (e) {
      if (e.message === "unauthorized") {
        showToast("Сессия истекла.", false);
        setToken("");
        showApp(false);
      } else {
        showToast("Ошибка сохранения. npm start?", false);
      }
    }
  });

  bind("calc-reload", "click", async function () {
    try {
      await refreshCalculatorForm();
      showToast("Калькулятор перезагружен.", true);
    } catch (e) {
      showToast("Не удалось загрузить calculator.json", false);
    }
  });

  if (getToken()) {
    showApp(true);
    loadAdminDataAfterLogin();
  }
})();
