(function () {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mediaClass(v) {
    return v ? "p-card__media p-card__media--" + esc(v) : "p-card__media";
  }

  function metaHtml(meta) {
    if (!meta || !meta.length) return "";
    return meta
      .map(function (t, i) {
        return (
          (i ? ' <span class="p-card__meta-sep">·</span> ' : "") + "<span>" + esc(t) + "</span>"
        );
      })
      .join("");
  }

  window.indigoLoadPortfolioData = async function () {
    var r = await fetch("/site/data/portfolio.json", { cache: "no-store" });
    if (!r.ok) throw new Error("portfolio");
    return r.json();
  };

  window.indigoMountHomePortfolio = function (data) {
    var el = document.getElementById("home-portfolio-mount");
    if (!el) return;
    var slugs = data.homeSlugs || [];
    el.innerHTML = slugs
      .map(function (slug, i) {
        var c = data.cases[slug];
        if (!c) return "";
        return (
          '<a href="/site/case.html?slug=' +
          esc(slug) +
          '" class="p-card reveal" data-reveal style="--i:' +
          i +
          '">' +
          '<div class="' +
          mediaClass(c.mediaVariant) +
          '"></div>' +
          '<span class="p-card__tag mono">' +
          esc(c.tag) +
          "</span>" +
          '<h3 class="p-card__title">' +
          esc(c.title) +
          "</h3>" +
          '<p class="p-card__desc">' +
          esc(c.stack) +
          "</p>" +
          "</a>"
        );
      })
      .join("");
    if (window.indigoObserveReveals) window.indigoObserveReveals(el);
  };

  window.indigoMountPortfolioGrid = function (data) {
    var el = document.getElementById("pf-grid-mount");
    if (!el) return;
    var order = data.order || Object.keys(data.cases || {});
    el.innerHTML = order
      .map(function (slug, i) {
        var c = data.cases[slug];
        if (!c) return "";
        var cat = esc(c.category || c.tag);
        return (
          '<article class="pf-item reveal" data-reveal data-category="' +
          cat +
          '" style="--i:' +
          i +
          '">' +
          '<a href="/site/case.html?slug=' +
          esc(slug) +
          '" class="p-card">' +
          '<div class="' +
          mediaClass(c.mediaVariant) +
          '"></div>' +
          '<span class="p-card__tag mono">' +
          esc(c.tag) +
          "</span>" +
          '<h2 class="p-card__title">' +
          esc(c.title) +
          "</h2>" +
          '<p class="p-card__desc">' +
          esc(c.stack) +
          "</p>" +
          '<p class="p-card__excerpt">' +
          esc(c.excerpt || "") +
          "</p>" +
          '<p class="p-card__meta mono">' +
          metaHtml(c.meta) +
          "</p>" +
          "</a></article>"
        );
      })
      .join("");
    if (window.indigoObserveReveals) window.indigoObserveReveals(el);
  };

  async function run() {
    try {
      var data = await window.indigoLoadPortfolioData();
      window.indigoMountHomePortfolio(data);
      window.indigoMountPortfolioGrid(data);
    } catch (e) {
      var msg =
        '<p class="portfolio-load-error">Не удалось загрузить <span class="mono">portfolio.json</span>. Запустите сайт через <span class="mono">npm start</span> или проверьте файл <span class="mono">site/data/portfolio.json</span>.</p>';
      var h = document.getElementById("home-portfolio-mount");
      var p = document.getElementById("pf-grid-mount");
      if (h) h.innerHTML = msg;
      if (p) p.innerHTML = msg;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
