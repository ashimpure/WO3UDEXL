// Owner-only editing: drag screenshots onto an item page and commit them to the repo.
// Opens with project.html?id=<item>#edit, or automatically once a token is saved in this browser.
(function () {
  const REPO = "ashimpure/WO3UDEXL";
  const BRANCH = "main";
  const DATA_PATH = "site/progress.json";
  const SHOT_DIR = "site/assets/screenshots";
  const TOKEN_KEY = "wo3uxl-edit-token";
  const API = `https://api.github.com/repos/${REPO}/contents/`;

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

  function toBase64Bytes(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const textToBase64 = (text) => toBase64Bytes(new TextEncoder().encode(text));
  const base64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function api(path, options = {}) {
    const response = await fetch(API + path + (options.method ? "" : `?ref=${BRANCH}&t=${Date.now()}`), {
      ...options,
      headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json", ...(options.headers || {}) }
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("GitHub didn't accept the token. Sign out and paste a new one.");
      if (response.status === 403 || response.status === 404) throw new Error("This token can't write to the repo. Check it has Contents: Read and write on ashimpure/WO3UDEXL.");
      throw new Error(detail.message || `GitHub error ${response.status}`);
    }
    return response.json();
  }

  function findItem(data, id) {
    let found = null;
    const walk = (item) => { if (item.id === id) found = item; (item.substreams || []).forEach(walk); };
    data.streams.forEach(walk);
    return found;
  }

  // Load progress.json from the repo, change it, and commit it back.
  async function updateData(itemId, message, change) {
    const file = await api(DATA_PATH);
    const data = JSON.parse(base64ToText(file.content));
    const item = findItem(data, itemId);
    if (!item) throw new Error("This item isn't in the repo's data any more.");
    if (!Array.isArray(item.screenshots)) item.screenshots = [];
    change(item);
    await api(DATA_PATH, {
      method: "PUT",
      body: JSON.stringify({ message, content: textToBase64(JSON.stringify(data, null, 2) + "\n"), sha: file.sha, branch: BRANCH })
    });
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shot";
  }

  async function uploadShots(itemId, files, caption, setStatus) {
    const added = [];
    for (const [i, file] of files.entries()) {
      const ext = (file.name.match(/\.(png|jpe?g|webp|gif)$/i) || [".png"])[0].toLowerCase();
      const name = `${itemId}-${Date.now().toString(36)}-${i}${ext}`;
      setStatus(`Uploading ${file.name}…`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await api(`${SHOT_DIR}/${name}`, {
        method: "PUT",
        body: JSON.stringify({ message: `Add screenshot to ${itemId}`, content: toBase64Bytes(bytes), branch: BRANCH })
      });
      added.push({ src: `assets/screenshots/${name}`, alt: caption || file.name.replace(/\.[^.]+$/, ""), caption });
    }
    setStatus("Adding to the board…");
    await updateData(itemId, `Add ${added.length} screenshot(s) to ${itemId}`, (item) => item.screenshots.push(...added));
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function signInPanel(panel, onDone) {
    panel.replaceChildren(el("h2", "", "Edit mode"));
    panel.append(el("p", "edit-help", "Paste your GitHub access token to add screenshots. It's kept only in this browser."));
    const input = el("input", "edit-input");
    input.type = "password";
    input.placeholder = "github_pat_…";
    input.autocomplete = "off";
    const button = el("button", "edit-button", "Sign in");
    button.type = "button";
    button.onclick = () => { if (input.value.trim()) { setToken(input.value.trim()); onDone(); } };
    const row = el("div", "edit-row");
    row.append(input, button);
    panel.append(row);
  }

  function editorPanel(panel, itemId, item) {
    panel.replaceChildren(el("h2", "", "Add screenshots"));
    const drop = el("label", "edit-drop");
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
    fileInput.multiple = true;
    fileInput.className = "edit-file";
    const dropText = el("span", "", "Drop images here, or click to choose");
    drop.append(fileInput, dropText);
    const caption = el("input", "edit-input");
    caption.placeholder = "Caption, e.g. Nobuyuki's Hyper attack";
    const save = el("button", "edit-button", "Publish");
    save.type = "button";
    save.disabled = true;
    const status = el("p", "edit-status");
    const setStatus = (t) => { status.textContent = t; };
    let files = [];
    const pick = (list) => {
      files = [...list].filter((f) => f.type.startsWith("image/"));
      dropText.textContent = files.length ? files.map((f) => f.name).join(", ") : "Drop images here, or click to choose";
      save.disabled = !files.length;
      drop.classList.toggle("has-files", files.length > 0);
    };
    fileInput.onchange = () => pick(fileInput.files);
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); pick(e.dataTransfer.files); });
    save.onclick = async () => {
      save.disabled = true;
      try {
        await uploadShots(itemId, files, caption.value.trim(), setStatus);
        setStatus("Published. The live page updates in about a minute.");
        pick([]);
        caption.value = "";
      } catch (error) {
        setStatus(error.message);
        save.disabled = false;
      }
    };
    const row = el("div", "edit-row");
    row.append(caption, save);
    panel.append(drop, row, status);

    // Remove buttons on the screenshots already shown.
    (item.screenshots || []).forEach((shot) => {
      const figure = [...document.querySelectorAll("figure")].find((f) => f.querySelector("img")?.getAttribute("src") === shot.src);
      if (!figure) return;
      const remove = el("button", "edit-remove", "Remove from page");
      remove.type = "button";
      remove.onclick = async () => {
        remove.disabled = true;
        remove.textContent = "Removing…";
        try {
          await updateData(itemId, `Remove screenshot from ${itemId}`,
            (it) => { it.screenshots = it.screenshots.filter((s) => s.src !== shot.src); });
          figure.remove();
          setStatus("Removed. The live page updates in about a minute.");
        } catch (error) {
          remove.disabled = false;
          remove.textContent = "Remove from page";
          setStatus(error.message);
        }
      };
      figure.append(remove);
    });

    const signOut = el("button", "edit-link", "Sign out of edit mode");
    signOut.type = "button";
    signOut.onclick = () => { setToken(""); panel.remove(); location.hash = ""; location.reload(); };
    panel.append(signOut);
  }

  // Called by project.html after an item page renders.
  window.startEditMode = function (container, itemId, item) {
    if (location.hash !== "#edit" && !getToken()) return;
    const panel = el("section", "section edit-panel");
    container.append(panel);
    const open = () => editorPanel(panel, itemId, item);
    getToken() ? open() : signInPanel(panel, open);
  };
})();
