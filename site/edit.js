// Owner-only editing: change an item's text, parts, wishlist and screenshots, and commit them to the repo.
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

  async function loadFresh() {
    const file = await api(DATA_PATH);
    return { sha: file.sha, data: JSON.parse(base64ToText(file.content)) };
  }

  // Load progress.json from the repo, change it, and commit it back. Returns the new data.
  async function commit(message, change, attempt = 0) {
    const { sha, data } = await loadFresh();
    change(data);
    data.asOf = new Date().toISOString().slice(0, 10);
    try {
      await api(DATA_PATH, {
        method: "PUT",
        body: JSON.stringify({ message, content: textToBase64(JSON.stringify(data, null, 2) + "\n"), sha, branch: BRANCH })
      });
    } catch (error) {
      if (attempt < 2 && /does not match|409/.test(error.message)) return commit(message, change, attempt + 1);
      throw error;
    }
    return data;
  }

  function updateData(itemId, message, change) {
    return commit(message, (data) => {
      const item = findItem(data, itemId);
      if (!item) throw new Error("This item isn't in the repo's data any more.");
      if (!Array.isArray(item.screenshots)) item.screenshots = [];
      change(item);
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
    panel.append(el("p", "edit-help", "Paste your GitHub access token to edit this site. It's kept only in this browser."));
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

  const STATES = { planning: "Planned", "in-progress": "In progress", "ready-to-test": "Ready to test", "on-hold": "On hold", complete: "Complete" };

  function field(label, control, note) {
    const box = el("label", "edit-field");
    box.append(el("span", "", label), control);
    if (note) box.append(el("small", "", note));
    return box;
  }

  function textInput(value) {
    const input = el("input", "edit-input");
    input.value = value || "";
    return input;
  }

  function textArea(value, tall) {
    const area = el("textarea", tall ? "edit-area tall" : "edit-area");
    area.value = value || "";
    return area;
  }

  function toolButton(label, title, onClick) {
    const button = el("button", "edit-tool", label);
    button.type = "button";
    if (title) { button.title = title; button.setAttribute("aria-label", title); }
    button.onclick = onClick;
    return button;
  }

  // Wrap the selected text in the description box, or put the marker at the start of each selected line.
  function wrapSelection(area, before, after, fallback) {
    const start = area.selectionStart, end = area.selectionEnd;
    const picked = area.value.slice(start, end) || fallback;
    area.setRangeText(before + picked + after, start, end, "end");
    area.focus();
    area.dispatchEvent(new Event("input"));
  }

  function listSelection(area) {
    const start = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;
    const picked = area.value.slice(start, area.selectionEnd) || "List item";
    area.setRangeText(picked.split("\n").map((line) => `- ${line}`).join("\n"), start, area.selectionEnd, "end");
    area.focus();
    area.dispatchEvent(new Event("input"));
  }

  // Swaps the page's heading, status and text for an editor in the same place.
  function openTextEditor(container, itemId, item, opener) {
    const shown = [...container.querySelectorAll(".detail-head, .detail-strip, .detail-text, .detail-now")];
    shown.forEach((node) => { node.hidden = true; });
    opener.hidden = true;
    const form = el("div", "edit-form");
    const title = textInput(item.title);
    const area = textInput(item.area);
    const state = el("select", "edit-input");
    Object.entries(STATES).forEach(([value, label]) => {
      const option = el("option", "", label);
      option.value = value;
      state.append(option);
    });
    state.value = item.state === "paused" ? "on-hold" : item.state;
    const progress = el("input", "edit-input");
    progress.type = "number";
    progress.min = "0";
    progress.max = "100";
    progress.value = item.progress;
    const summary = textArea(item.summary);
    const activity = textArea(item.activity);
    const description = textArea(item.description, true);
    const preview = el("div", "edit-preview");
    const showPreview = () => preview.replaceChildren(makeRichText("detail-text", description.value || " "));
    description.addEventListener("input", showPreview);
    showPreview();
    const tools = el("div", "edit-tools");
    tools.append(
      toolButton("B", "Bold", () => wrapSelection(description, "**", "**", "bold text")),
      toolButton("I", "Italic", () => wrapSelection(description, "*", "*", "italic text")),
      toolButton("Link", "Link", () => {
        const url = prompt("Link address (https://...)");
        if (url && url.startsWith("https://")) wrapSelection(description, "[", `](${url})`, "link text");
      }),
      toolButton("List", "List", () => listSelection(description)));
    const pair = el("div", "edit-pair");
    pair.append(field("Status", state), field("Progress (0 to 100)", progress), field("Area", area, "Shown beside the status."));
    const save = el("button", "edit-button", "Publish");
    save.type = "button";
    const cancel = el("button", "edit-link", "Cancel");
    cancel.type = "button";
    const status = el("p", "edit-status");
    cancel.onclick = () => {
      form.remove();
      shown.forEach((node) => { node.hidden = false; });
      opener.hidden = false;
    };
    save.onclick = async () => {
      const value = Number(progress.value);
      if (!title.value.trim()) { status.textContent = "The title can't be empty."; return; }
      if (!Number.isInteger(value) || value < 0 || value > 100) { status.textContent = "Progress must be a whole number from 0 to 100."; return; }
      save.disabled = true;
      status.textContent = "Publishing…";
      try {
        const data = await updateData(itemId, `Edit ${itemId}`, (it) => {
          it.title = title.value.trim();
          it.area = area.value.trim();
          it.state = state.value;
          it.progress = value;
          it.summary = summary.value.trim();
          it.activity = activity.value.trim();
          it.description = description.value.trim();
        });
        window.trackerRender(data);
      } catch (error) {
        status.textContent = error.message;
        save.disabled = false;
      }
    };
    const row = el("div", "edit-row");
    row.append(save);
    form.append(field("Title", title), pair,
      field("Summary", summary, "The short text on the list pages."),
      field("Now", activity, "What's happening at the moment."),
      field("Description", description), tools, preview, row, cancel, status);
    opener.after(form);
  }

  function uniqueId(data, title) {
    const base = slug(title);
    let id = base, n = 2;
    while (findItem(data, id)) id = `${base}-${n++}`;
    return id;
  }

  // Add, remove and reorder a list of items: the areas on the home page, or the parts of an area.
  function itemsEditor(panel, heading, items, getList, setStatus) {
    panel.append(el("h2", "", heading));
    const list = el("ul", "edit-list");
    const run = async (button, message, change) => {
      button.disabled = true;
      setStatus("Publishing…");
      try {
        window.trackerRender(await commit(message, change));
      } catch (error) {
        setStatus(error.message);
        button.disabled = false;
      }
    };
    items.forEach((entry, i) => {
      const li = el("li");
      const move = (delta) => (data) => {
        const all = getList(data);
        const from = all.findIndex((x) => x.id === entry.id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= all.length) throw new Error("The list has changed. Reload the page and try again.");
        all.splice(to, 0, all.splice(from, 1)[0]);
      };
      const up = toolButton("↑", `Move ${entry.title} up`, () => run(up, `Move ${entry.id}`, move(-1)));
      const down = toolButton("↓", `Move ${entry.title} down`, () => run(down, `Move ${entry.id}`, move(1)));
      up.disabled = i === 0;
      down.disabled = i === items.length - 1;
      const remove = toolButton("Remove", `Remove ${entry.title}`, () => {
        const parts = (entry.substreams || []).length;
        if (!confirm(`Remove "${entry.title}"${parts ? ` and its ${parts} part(s)` : ""} from the site?`)) return;
        run(remove, `Remove ${entry.id}`, (data) => {
          const all = getList(data);
          const from = all.findIndex((x) => x.id === entry.id);
          if (from >= 0) all.splice(from, 1);
        });
      });
      li.append(el("span", "", entry.title), up, down, remove);
      list.append(li);
    });
    const name = textInput("");
    name.placeholder = "New title";
    const add = el("button", "edit-button", "Add");
    add.type = "button";
    add.onclick = () => {
      const title = name.value.trim();
      if (!title) return;
      run(add, `Add ${title}`, (data) => {
        getList(data).push({
          id: uniqueId(data, title), title, area: title, state: "planning", progress: 0,
          summary: `${title} is planned.`, activity: `${title} is planned.`, description: "", substreams: [], screenshots: []
        });
      });
    };
    const row = el("div", "edit-row");
    row.append(name, add);
    panel.append(list, row);
  }

  // Wishlist groups: a title and one name per line. Clearing a group's title removes the group.
  function wishlistEditor(panel, itemId, item, setStatus) {
    panel.append(el("h2", "", "Wishlist"));
    const groups = el("div");
    const addGroup = (group) => {
      const box = el("div", "edit-group");
      const title = textInput(group.title);
      const names = textArea((group.characters || []).join("\n"));
      box.append(field("Group", title, "Clear this to remove the group."), field("Characters, one per line", names));
      groups.append(box);
      return { title, names };
    };
    const fields = (item.plannedGroups || []).map(addGroup);
    const more = el("button", "edit-tool", "Add group");
    more.type = "button";
    more.onclick = () => fields.push(addGroup({ title: "", characters: [] }));
    const save = el("button", "edit-button", "Publish wishlist");
    save.type = "button";
    save.onclick = async () => {
      save.disabled = true;
      setStatus("Publishing…");
      const planned = fields.filter((f) => f.title.value.trim()).map((f) => ({
        title: f.title.value.trim(),
        characters: f.names.value.split("\n").map((n) => n.trim()).filter(Boolean)
      }));
      try {
        window.trackerRender(await updateData(itemId, `Edit wishlist on ${itemId}`, (it) => { it.plannedGroups = planned; }));
      } catch (error) {
        setStatus(error.message);
        save.disabled = false;
      }
    };
    const row = el("div", "edit-row");
    row.append(more, save);
    panel.append(groups, row);
  }

  function editorPanel(panel, itemId, item) {
    panel.replaceChildren();
    const opener = el("button", "edit-button edit-open", "Edit this page");
    opener.type = "button";
    opener.onclick = () => openTextEditor(panel.parentElement, itemId, item, opener);
    panel.parentElement.querySelector(".back").after(opener);
    const listStatus = el("p", "edit-status");
    itemsEditor(panel, "Parts of this area", item.substreams || [], (data) => {
      const it = findItem(data, itemId);
      if (!Array.isArray(it.substreams)) it.substreams = [];
      return it.substreams;
    }, (t) => { listStatus.textContent = t; });
    panel.append(listStatus);
    if (Array.isArray(item.plannedGroups)) {
      wishlistEditor(panel, itemId, item, (t) => { listStatus.textContent = t; });
      panel.append(listStatus);
    }
    panel.append(el("h2", "", "Add screenshots"));
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

    panel.append(signOutButton(panel));
  }

  // The live site can lag a commit by a minute, so edit mode draws from the repo's current data once on load.
  let freshLoaded = false;
  async function showFreshData() {
    if (freshLoaded) return;
    freshLoaded = true;
    window.trackerRender((await loadFresh()).data);
  }

  function signOutButton(panel) {
    const signOut = el("button", "edit-link", "Sign out of edit mode");
    signOut.type = "button";
    signOut.onclick = () => { setToken(""); panel.remove(); location.hash = ""; location.reload(); };
    return signOut;
  }

  function startPanel(container, open) {
    if (location.hash !== "#edit" && !getToken()) return;
    const panel = el("section", "section edit-panel");
    container.append(panel);
    const go = () => {
      open(panel);
      showFreshData().catch((error) => panel.prepend(el("p", "edit-status", error.message)));
    };
    getToken() ? go() : signInPanel(panel, go);
  }

  // Called by project.html after an item page renders.
  window.startEditMode = function (container, itemId, item) {
    startPanel(container, (panel) => editorPanel(panel, itemId, item));
  };

  // Called by index.html after the list of areas renders.
  window.startHomeEdit = function (lines) {
    document.querySelector(".home-edit")?.remove();
    const holder = el("div", "home-edit");
    lines.after(holder);
    startPanel(holder, (panel) => {
      panel.replaceChildren();
      const status = el("p", "edit-status");
      loadFresh().then(({ data }) => {
        itemsEditor(panel, "Areas", data.streams, (d) => d.streams, (t) => { status.textContent = t; });
        panel.append(status, signOutButton(panel));
      }).catch((error) => { status.textContent = error.message; panel.append(status); });
    });
  };
})();
