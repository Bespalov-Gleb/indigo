(function () {
  "use strict";

  var TOKEN_KEY = "indigo_admin_token";
  var calcState = null;
  var portfolioState = null;
  var pfEditingSlug = null;
  var calcTypeAddonsCollapsed = {};
  var pfSectionCollapsed = {
    meta: true,
    gallery: true,
    video: true,
    links: true,
  };

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
      calcState = { version: 1, maxAddonQty: 12, types: [], addons: {} };
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

  async function uploadPortfolioMedia(file, kind) {
    var fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    var t = getToken();
    var headers = {};
    if (t) headers.Authorization = "Bearer " + t;
    var r = await fetch("/api/admin/upload-portfolio", {
      method: "POST",
      headers: headers,
      body: fd,
    });
    var data = await r.json().catch(function () {
      return {};
    });
    if (r.status === 401) {
      var ue = new Error("unauthorized");
      ue.code = "unauthorized";
      throw ue;
    }
    if (!r.ok) {
      var fe = new Error(data.error || "upload_failed");
      fe.code = "upload";
      throw fe;
    }
    if (!data.url) {
      var ne = new Error("no_url");
      ne.code = "upload";
      throw ne;
    }
    return data.url;
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
    var collapsed = !!renderTypeAddonsHtml._collapsed;
    return (
      '<div class="admin-calc-type-addons">' +
      '<div class="admin-section__row">' +
      '<h3 class="admin-calc-type-addons__title">Дополнительные опции</h3>' +
      '<div class="admin-calc-type-addons__controls">' +
      '<button type="button" class="admin-chip-btn admin-chip-btn--small calc-addon-toggle" aria-expanded="' +
      (collapsed ? "false" : "true") +
      '">' +
      (collapsed ? "Развернуть" : "Свернуть") +
      "</button>" +
      '<button type="button" class="admin-chip-btn admin-chip-btn--small calc-addon-add">+ Опция</button>' +
      "</div>" +
      "</div>" +
      '<p class="admin-hint admin-calc-type-addons__hint">Опции привязаны к <strong>этому</strong> типу. ID: латиница/цифры/дефис (например <span class="mono">payments</span>).</p>' +
      '<div class="admin-calc-type-addons__body"' +
      (collapsed ? ' hidden="hidden"' : "") +
      ">" +
      keys.map(function (key) {
        var a = a0[key] || {};
        var once = a.mode !== "qty";
        return (
          '<fieldset class="admin-fieldset admin-fieldset--nested-addon" data-calc-addon="' +
          esc(key) +
          '">' +
          '<legend class="admin-calc-addon-legend"><code>' +
          esc(key) +
          '</code><span class="admin-calc-addon-legend__actions">' +
          '<label class="admin-switch admin-switch--addon" title="Показывать опцию">' +
          '<input type="checkbox" data-field="enabled" ' +
          (a.enabled !== false ? "checked" : "") +
          " />" +
          '<span class="admin-switch__track" aria-hidden="true"></span>' +
          '<span class="admin-switch__text">вкл</span>' +
          "</label>" +
          '<button type="button" class="calc-addon-remove" title="Удалить опцию" aria-label="Удалить опцию">×</button>' +
          "</span></legend>" +
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
      "</div>" +
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
        var k = t && t.id ? String(t.id) : "idx:" + i;
        renderTypeAddonsHtml._collapsed = !!calcTypeAddonsCollapsed[k];
        return (
          '<fieldset class="admin-fieldset admin-calc-type" data-calc-type-key="' +
          esc(k) +
          '">' +
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
      maxAddonQty: parseInt($("maxAddonQty").value, 10) || 12,
      types: types,
      addons: {},
    };
  }

  async function refreshCalculatorForm() {
    calcState = await loadCalculator();
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

  function pfGalleryVariantOptions(selected) {
    return ["", "b", "c", "d", "e", "f", "g", "h"]
      .map(function (v) {
        return (
          '<option value="' +
          esc(v) +
          '"' +
          (selected === v ? " selected" : "") +
          ">" +
          (v || "базовый") +
          "</option>"
        );
      })
      .join("");
  }

  function pfGalleryRowHtml(g) {
    g = g || {};
    var img = g.image || "";
    var hasImg = !!img;
    return (
      '<div class="admin-repeat-row admin-repeat-row--gal">' +
      '<div class="admin-field"><label>Вариант</label><select data-pf-gal-var>' +
      pfGalleryVariantOptions(g.variant != null ? g.variant : "") +
      "</select></div>" +
      '<div class="admin-field admin-field--full">' +
      "<label>Фото</label>" +
      '<div class="admin-upload-line">' +
      '<input type="hidden" data-pf-gal-img value="' +
      esc(img) +
      '" />' +
      '<button type="button" class="admin-chip-btn admin-chip-btn--small" data-pf-gal-pick>Файл…</button>' +
      '<input type="file" data-pf-gal-file accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" hidden />' +
      '<button type="button" class="admin-chip-btn admin-chip-btn--small" data-pf-gal-img-clear' +
      (hasImg ? "" : " hidden") +
      ">Сбросить</button>" +
      "</div>" +
      '<p class="admin-hint admin-gal-path mono" data-pf-gal-path>' +
      esc(hasImg ? img : "Файл не выбран") +
      "</p>" +
      '<div class="admin-gal-thumb"' +
      (hasImg ? "" : " hidden") +
      ' data-pf-gal-thumb><img alt="" decoding="async" /></div>' +
      "</div>" +
      '<div class="admin-field"><label>Подпись</label><input type="text" data-pf-gal-cap value="' +
      esc(g.caption || "") +
      '" /></div>' +
      '<button type="button" class="admin-repeat-row__remove" data-pf-gal-remove>×</button></div>'
    );
  }

  function syncGalleryRowThumb(row) {
    if (!row) return;
    var h = row.querySelector("[data-pf-gal-img]");
    var thumb = row.querySelector("[data-pf-gal-thumb]");
    var im = thumb && thumb.querySelector("img");
    var pathEl = row.querySelector("[data-pf-gal-path]");
    var clr = row.querySelector("[data-pf-gal-img-clear]");
    var v = h && h.value ? h.value.trim() : "";
    if (pathEl) pathEl.textContent = v || "Файл не выбран";
    if (v) {
      if (thumb) thumb.hidden = false;
      if (im) im.src = v;
      if (clr) clr.hidden = false;
    } else {
      if (thumb) thumb.hidden = true;
      if (im) im.removeAttribute("src");
      if (clr) clr.hidden = true;
    }
  }

  function pfSyncVideoBlocks() {
    var sel = $("pf-video-source");
    var src = sel ? sel.value : "none";
    var yt = $("pf-video-youtube-block");
    var fb = $("pf-video-file-block");
    var nw = $("pf-video-note-wrap");
    if (yt) yt.hidden = src !== "youtube";
    if (fb) fb.hidden = src !== "file";
    if (nw) nw.hidden = src === "none";
  }

  function pfSyncVideoFilePreview() {
    var urlEl = $("pf-video-file-url");
    var prev = $("pf-video-file-preview");
    var lbl = $("pf-video-file-pathlbl");
    var clr = $("pf-video-file-clear");
    var u = urlEl && urlEl.value ? urlEl.value.trim() : "";
    if (lbl) lbl.textContent = u || "Файл не выбран";
    if (prev) {
      if (u) {
        prev.hidden = false;
        prev.src = u;
      } else {
        prev.hidden = true;
        prev.removeAttribute("src");
      }
    }
    if (clr) clr.hidden = !u;
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
    $("pf-gallery-rows").innerHTML = gal.map(pfGalleryRowHtml).join("");
    document.querySelectorAll("#pf-gallery-rows .admin-repeat-row--gal").forEach(syncGalleryRowThumb);

    var vid = c.video;
    var vsrc = "none";
    if (vid && vid.file) vsrc = "file";
    else if (vid && vid.youtube) vsrc = "youtube";
    $("pf-video-source").value = vsrc;
    $("pf-video-id").value = vsrc === "youtube" && vid && vid.youtube ? vid.youtube : "";
    $("pf-video-note").value = vid && vid.note ? vid.note : "";
    $("pf-video-file-url").value = vsrc === "file" && vid && vid.file ? vid.file : "";
    $("pf-video-file-input").value = "";
    pfSyncVideoBlocks();
    pfSyncVideoFilePreview();

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

  function detectPfSectionKey(sectionEl) {
    if (!sectionEl) return "";
    if (sectionEl.querySelector("#pf-meta-rows")) return "meta";
    if (sectionEl.querySelector("#pf-gallery-rows")) return "gallery";
    if (sectionEl.querySelector("#pf-video-fields")) return "video";
    if (sectionEl.querySelector("#pf-link-rows")) return "links";
    return "";
  }

  function setPfSectionCollapsed(sectionEl, key, collapsed) {
    sectionEl.classList.toggle("is-collapsed", !!collapsed);
    var btn = sectionEl.querySelector(".admin-section-toggle");
    if (btn) {
      btn.textContent = collapsed ? "Развернуть" : "Свернуть";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    if (key) pfSectionCollapsed[key] = !!collapsed;
  }

  function initPfCollapsibleSections() {
    document.querySelectorAll("#pf-editor .admin-section--nested").forEach(function (sectionEl) {
      var h = sectionEl.querySelector("h3");
      if (!h) return;
      var key = detectPfSectionKey(sectionEl);
      if (!h.querySelector(".admin-section-toggle")) {
        h.classList.add("admin-section-title");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "admin-section-toggle";
        btn.setAttribute("data-pf-toggle-section", key || "misc");
        h.appendChild(btn);
      }
      setPfSectionCollapsed(sectionEl, key, !!pfSectionCollapsed[key]);
    });
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
      var hid = row.querySelector("[data-pf-gal-img]");
      var item = { variant: v ? v.value : "", caption: cap ? cap.value.trim() : "" };
      var ip = hid && hid.value ? hid.value.trim() : "";
      if (ip) item.image = ip;
      gallery.push(item);
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
    var vsrc = $("pf-video-source").value;
    var noteTrim = $("pf-video-note").value.trim();
    if (vsrc === "youtube") {
      var yid = $("pf-video-id").value.trim();
      if (yid) {
        video = { youtube: yid };
        if (noteTrim) video.note = noteTrim;
      }
    } else if (vsrc === "file") {
      var fu = $("pf-video-file-url").value.trim();
      if (fu) {
        video = { file: fu };
        if (noteTrim) video.note = noteTrim;
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

  bind("pf-video-source", "change", function () {
    pfSyncVideoBlocks();
  });

  bind("pf-video-file-pick", "click", function () {
    $("pf-video-file-input").click();
  });

  bind("pf-video-file-clear", "click", function () {
    $("pf-video-file-url").value = "";
    $("pf-video-file-input").value = "";
    pfSyncVideoFilePreview();
  });

  bind("pf-video-file-input", "change", async function () {
    var inp = $("pf-video-file-input");
    if (!inp || !inp.files || !inp.files[0]) return;
    var f = inp.files[0];
    try {
      var url = await uploadPortfolioMedia(f, "video");
      $("pf-video-file-url").value = url;
      pfSyncVideoFilePreview();
      showToast("Видео загружено.", true);
    } catch (e) {
      if (e.code === "unauthorized") {
        showToast("Войдите снова.", false);
        setToken("");
        showApp(false);
      } else {
        showToast("Загрузка видео не удалась.", false);
      }
      inp.value = "";
    }
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
    wrap.innerHTML = pfGalleryRowHtml({});
    var row = wrap.firstElementChild;
    $("pf-gallery-rows").appendChild(row);
    syncGalleryRowThumb(row);
  });

  bind("pf-gallery-rows", "click", function (e) {
    if (e.target.closest("[data-pf-gal-remove]")) {
      e.target.closest(".admin-repeat-row").remove();
      return;
    }
    if (e.target.closest("[data-pf-gal-pick]")) {
      var row = e.target.closest(".admin-repeat-row--gal");
      if (!row) return;
      var finp = row.querySelector("[data-pf-gal-file]");
      if (finp) finp.click();
      return;
    }
    if (e.target.closest("[data-pf-gal-img-clear]")) {
      var row2 = e.target.closest(".admin-repeat-row--gal");
      if (!row2) return;
      var hid = row2.querySelector("[data-pf-gal-img]");
      if (hid) hid.value = "";
      var fi = row2.querySelector("[data-pf-gal-file]");
      if (fi) fi.value = "";
      syncGalleryRowThumb(row2);
    }
  });

  bind("pf-gallery-rows", "change", async function (e) {
    var inp = e.target.closest("[data-pf-gal-file]");
    if (!inp || !inp.files || !inp.files[0]) return;
    var row = inp.closest(".admin-repeat-row--gal");
    var f = inp.files[0];
    try {
      var url = await uploadPortfolioMedia(f, "image");
      var hid = row && row.querySelector("[data-pf-gal-img]");
      if (hid) hid.value = url;
      syncGalleryRowThumb(row);
      showToast("Изображение загружено.", true);
    } catch (err) {
      if (err.code === "unauthorized") {
        showToast("Войдите снова.", false);
        setToken("");
        showApp(false);
      } else {
        showToast("Загрузка изображения не удалась.", false);
      }
    }
    inp.value = "";
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

  bind("pf-editor", "click", function (e) {
    var toggle = e.target.closest(".admin-section-toggle");
    if (!toggle) return;
    var sectionEl = toggle.closest(".admin-section--nested");
    var key = detectPfSectionKey(sectionEl);
    var collapsedNow = sectionEl.classList.contains("is-collapsed");
    setPfSectionCollapsed(sectionEl, key, !collapsedNow);
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

    var toggleAddonsBtn = e.target.closest(".calc-addon-toggle");
    if (toggleAddonsBtn) {
      var typeRoot = toggleAddonsBtn.closest(".admin-calc-type");
      var body = typeRoot ? typeRoot.querySelector(".admin-calc-type-addons__body") : null;
      if (!typeRoot || !body) return;
      var key = typeRoot.getAttribute("data-calc-type-key") || "";
      var willExpand = body.hidden;
      body.hidden = !willExpand;
      toggleAddonsBtn.textContent = willExpand ? "Свернуть" : "Развернуть";
      toggleAddonsBtn.setAttribute("aria-expanded", willExpand ? "true" : "false");
      if (key) calcTypeAddonsCollapsed[key] = !willExpand;
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
      err.textContent = "Неверный пароль. Проверьте значение ADMIN_PASSWORD на сервере.";
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
  initPfCollapsibleSections();
})();
