(function () {
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src, window.location.href).origin;
  var key = script.getAttribute("data-key") || "";
  var slot = script.getAttribute("data-slot") || "banner";
  var host = document.createElement("div");
  host.style.cssText =
    "font-family: Georgia, serif; color:#1c1a16; background:#fffdf8; border:1px solid #e4dccf; border-radius:12px; padding:14px; max-width:420px;";
  script.parentNode.insertBefore(host, script.nextSibling);
  host.textContent = "Loading DYNamiQ campaign…";
  var endpoint =
    origin + "/api/network/ads?slot=" + encodeURIComponent(slot) + "&record=1";
  fetch(endpoint, { headers: { "x-dynamiq-key": key } })
    .then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function (result) {
      host.textContent = "";
      if (!result.ok) {
        host.textContent = result.body.error || "No DYNamiQ ads.";
        return;
      }
      var ads = result.body.ads || [];
      if (!ads.length) {
        host.textContent = "No eligible DYNamiQ campaigns right now.";
        return;
      }
      var ad = ads[0];
      var title = document.createElement("div");
      title.style.cssText = "font-size:12px; letter-spacing:.14em; color:#d63a2f;";
      title.textContent = "DYNAMIQ PARTNER";
      var h = document.createElement("div");
      h.style.cssText = "font-size:20px; font-weight:700; margin-top:4px;";
      h.textContent = ad.headline;
      var p = document.createElement("p");
      p.style.cssText = "font-size:14px; margin:8px 0; color:#6f6a60;";
      p.textContent = ad.body;
      if (ad.image) {
        var img = document.createElement("img");
        img.src = ad.image;
        img.alt = "";
        img.style.cssText = "width:100%; border-radius:8px; margin:8px 0;";
        host.appendChild(img);
      }
      host.appendChild(title);
      host.appendChild(h);
      host.appendChild(p);
      var a = document.createElement("a");
      a.textContent = ad.cta || "Open";
      a.style.cssText =
        "display:inline-block; background:#d63a2f; color:#fff8f4; text-decoration:none; padding:8px 12px; border-radius:8px; font-family: sans-serif; font-size:14px;";
      var click =
        origin +
        "/api/network/click?surface=partner&campaign=" +
        encodeURIComponent(ad.id) +
        "&slot=" +
        encodeURIComponent(slot) +
        "&key=" +
        encodeURIComponent(key);
      a.href = click;
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      host.appendChild(a);
      var fine = document.createElement("p");
      fine.style.cssText = "font-size:11px; color:#6f6a60; margin-top:8px;";
      fine.textContent = ad.onchainVerified
        ? "Devnet memo verified. Delivery is still this partner slot, not every Solana site."
        : "Off-chain creative. Not yet verified with a devnet memo.";
      host.appendChild(fine);
    })
    .catch(function () {
      host.textContent = "DYNamiQ slot could not load.";
    });
})();
