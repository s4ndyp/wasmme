function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function toast(message, type = "success") {
  const region = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || "Request mislukt");
  }
  return data;
}

function renderStatus(data) {
  const { staging, published } = data;

  document.getElementById("stagingFiles").textContent = staging.fileCount;
  document.getElementById("stagingMeta").textContent = staging.fileCount
    ? `${formatBytes(staging.totalBytes)} · index.html ${staging.hasIndex ? "✓" : "ontbreekt"}`
    : "Nog leeg";

  document.getElementById("publishedFiles").textContent = published.fileCount;
  document.getElementById("publishedMeta").textContent = published.fileCount
    ? `${formatBytes(published.totalBytes)} · live op poort 80`
    : "Nog niet gepubliceerd";

  const hint = document.getElementById("indexHint");
  if (staging.fileCount && !staging.hasIndex) {
    hint.textContent = "Tip: staging heeft geen index.html — je WASM-app werkt mogelijk niet zonder entry HTML.";
    hint.className = "hint";
  } else if (published.fileCount) {
    hint.textContent = "Gepubliceerde site is bereikbaar op http://<host>:80/";
    hint.className = "hint ok";
  } else {
    hint.textContent = "";
    hint.className = "hint";
  }

  const liveLink = document.getElementById("liveSiteLink");
  if (published.fileCount) {
    liveLink.hidden = false;
    const host = window.location.hostname;
    liveLink.href = `http://${host}/`;
    liveLink.title = "Opent poort 80 op dezelfde host (niet de admin-poort)";
  } else {
    liveLink.hidden = true;
  }

  document.getElementById("publishBtn").disabled = !staging.fileCount;
}

async function refreshStatus() {
  const data = await api("/api/status");
  renderStatus(data);
  return data;
}

async function checkHealth() {
  const pill = document.getElementById("healthPill");
  try {
    await api("/api/health");
    pill.textContent = "Online";
    pill.className = "pill ok";
  } catch {
    pill.textContent = "Offline";
    pill.className = "pill err";
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      document.getElementById("panel-zip").classList.toggle("hidden", tab.dataset.tab !== "zip");
      document.getElementById("panel-files").classList.toggle("hidden", tab.dataset.tab !== "files");
    });
  });
}

function setupDropzone(zoneId, inputId, onFiles) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      onFiles(e.dataTransfer.files);
    }
  });
  input.addEventListener("change", () => {
    if (input.files.length) onFiles(input.files);
  });
}

let selectedZip = null;
let selectedFiles = null;

setupDropzone("zipDrop", "zipInput", (files) => {
  selectedZip = files[0];
  document.getElementById("zipName").textContent = selectedZip ? selectedZip.name : "Geen bestand gekozen";
  document.getElementById("uploadZipBtn").disabled = !selectedZip;
});

setupDropzone("filesDrop", "filesInput", (files) => {
  selectedFiles = files;
  document.getElementById("filesName").textContent = selectedFiles.length
    ? `${selectedFiles.length} bestand(en) geselecteerd`
    : "Geen bestanden gekozen";
  document.getElementById("uploadFilesBtn").disabled = !selectedFiles.length;
});

document.getElementById("uploadZipBtn").addEventListener("click", async () => {
  if (!selectedZip) return;
  const fd = new FormData();
  fd.append("archive", selectedZip);
  try {
    await api("/api/upload/zip", { method: "POST", body: fd });
    toast("Zip geüpload naar staging");
    await refreshStatus();
  } catch (e) {
    toast(e.message, "error");
  }
});

document.getElementById("uploadFilesBtn").addEventListener("click", async () => {
  if (!selectedFiles || !selectedFiles.length) return;
  const fd = new FormData();
  for (const f of selectedFiles) {
    fd.append("files", f, f.webkitRelativePath || f.name);
  }
  try {
    await api("/api/upload/files", { method: "POST", body: fd });
    toast("Bestanden geüpload naar staging");
    await refreshStatus();
  } catch (e) {
    toast(e.message, "error");
  }
});

document.getElementById("clearStagingBtn").addEventListener("click", async () => {
  if (!confirm("Staging legen?")) return;
  try {
    await api("/api/staging/clear", { method: "POST" });
    toast("Staging geleegd");
    selectedZip = null;
    selectedFiles = null;
    document.getElementById("zipName").textContent = "Geen bestand gekozen";
    document.getElementById("filesName").textContent = "Geen bestanden gekozen";
    document.getElementById("uploadZipBtn").disabled = true;
    document.getElementById("uploadFilesBtn").disabled = true;
    await refreshStatus();
  } catch (e) {
    toast(e.message, "error");
  }
});

document.getElementById("publishBtn").addEventListener("click", async () => {
  if (!confirm("Staging nu live zetten op poort 80?")) return;
  const btn = document.getElementById("publishBtn");
  btn.disabled = true;
  try {
    const res = await api("/api/publish", { method: "POST" });
    toast(res.message || "Gepubliceerd");
    await refreshStatus();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
    await refreshStatus();
  }
});

setupTabs();
checkHealth();
refreshStatus().catch(() => {
  toast("Kan status niet laden", "error");
});
