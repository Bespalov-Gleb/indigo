(function () {
  "use strict";

  var root = document.querySelector("[data-case-root]");
  var missing = document.querySelector("[data-case-missing]");
  if (!root || !missing) return;

  function mediaClass(variant) {
    var base = "p-card__media case-shot__plate";
    if (!variant) return base;
    return base + " p-card__media--" + variant;
  }

  function buildGallery(items) {
    var frag = document.createDocumentFragment();
    items.forEach(function (item, i) {
      var fig = document.createElement("figure");
      fig.className = "case-shot reveal";
      fig.setAttribute("data-reveal", "");
      fig.style.setProperty("--i", String(i));
      if (item.image) {
        var imgWrap = document.createElement("div");
        imgWrap.className = "case-shot__img-wrap";
        var img = document.createElement("img");
        img.className = "case-shot__img";
        img.src = item.image;
        img.alt = item.caption || "";
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
        imgWrap.appendChild(img);
        fig.appendChild(imgWrap);
      } else {
        var plate = document.createElement("div");
        plate.className = mediaClass(item.variant);
        plate.setAttribute("role", "img");
        fig.appendChild(plate);
      }
      var cap = document.createElement("figcaption");
      cap.className = "case-shot__caption mono";
      cap.textContent = item.caption;
      fig.appendChild(cap);
      frag.appendChild(fig);
    });
    return frag;
  }

  function buildVideo(video) {
    var wrap = document.createElement("div");
    wrap.className = "case-video__inner";
    if (video && video.file) {
      var ratioF = document.createElement("div");
      ratioF.className = "case-video__ratio";
      var vEl = document.createElement("video");
      vEl.className = "case-video__file";
      vEl.setAttribute("controls", "");
      vEl.setAttribute("playsinline", "");
      vEl.setAttribute("preload", "metadata");
      vEl.src = video.file;
      ratioF.appendChild(vEl);
      wrap.appendChild(ratioF);
      if (video.note) {
        var noteF = document.createElement("p");
        noteF.className = "case-video__note";
        noteF.textContent = video.note;
        wrap.appendChild(noteF);
      }
    } else if (video && video.youtube) {
      var ratio = document.createElement("div");
      ratio.className = "case-video__ratio";
      var iframe = document.createElement("iframe");
      iframe.className = "case-video__iframe";
      iframe.setAttribute(
        "src",
        "https://www.youtube-nocookie.com/embed/" +
          video.youtube +
          "?rel=0&modestbranding=1"
      );
      iframe.setAttribute("title", "Видео по проекту");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      );
      iframe.setAttribute("loading", "lazy");
      ratio.appendChild(iframe);
      wrap.appendChild(ratio);
      if (video.note) {
        var note = document.createElement("p");
        note.className = "case-video__note";
        note.textContent = video.note;
        wrap.appendChild(note);
      }
    } else {
      var ph = document.createElement("div");
      ph.className = "case-video__placeholder";
      ph.innerHTML =
        '<p class="case-video__placeholder-title">Видео</p><p class="case-video__placeholder-text">Видеообзор проекта будет добавлен по готовности материалов.</p>';
      wrap.appendChild(ph);
    }
    return wrap;
  }

  function buildLinks(links) {
    var frag = document.createDocumentFragment();
    links.forEach(function (link) {
      var a = document.createElement("a");
      a.className = link.primary ? "btn btn--primary" : "btn btn--ghost";
      a.href = link.href;
      a.textContent = link.label;
      if (link.external) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
      frag.appendChild(a);
    });
    return frag;
  }

  async function run() {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("slug") || params.get("case");

    var portfolio;
    try {
      var r = await fetch("/site/data/portfolio.json", { cache: "no-store" });
      if (!r.ok) throw new Error("bad");
      portfolio = await r.json();
    } catch (e) {
      root.hidden = true;
      missing.hidden = false;
      document.title = "Кейс не найден — INDIGO";
      return;
    }

    var data = slug && portfolio.cases ? portfolio.cases[slug] : null;

    if (!data) {
      root.hidden = true;
      missing.hidden = false;
      document.title = "Кейс не найден — INDIGO";
      return;
    }

    document.title = data.title + " — кейс · INDIGO";

    root.querySelector("[data-case-tag]").textContent = data.tag;
    root.querySelector("[data-case-title]").textContent = data.title;
    root.querySelector("[data-case-stack]").textContent = data.stack;
    root.querySelector("[data-case-lead]").textContent = data.lead;

    var galleryMount = root.querySelector("[data-case-gallery]");
    galleryMount.innerHTML = "";
    galleryMount.appendChild(buildGallery(data.gallery || []));

    var videoMount = root.querySelector("[data-case-video]");
    videoMount.innerHTML = "";
    videoMount.appendChild(buildVideo(data.video));

    var linkList = (data.links || []).map(function (l, i) {
      return {
        label: l.label,
        href: l.href,
        external: l.external,
        primary: i === 0,
      };
    });
    linkList.push({
      label: "Все кейсы",
      href: "/site/portfolio.html",
      external: false,
      primary: false,
    });

    var linksMount = root.querySelector("[data-case-links]");
    linksMount.innerHTML = "";
    linksMount.appendChild(buildLinks(linkList));

    if (window.indigoObserveReveals) window.indigoObserveReveals(root);
  }

  run();
})();
