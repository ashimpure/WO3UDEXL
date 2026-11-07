const STATE_LABELS = {
  planning: "Planned",
  "in-progress": "In progress",
  "ready-to-test": "Ready to test",
  "on-hold": "On hold",
  paused: "On hold",
  complete: "Complete"
};
const NOW_LABELS = {
  planning: "Planned:",
  "in-progress": "Now:",
  "ready-to-test": "Ready to test:",
  "on-hold": "Latest:",
  paused: "Latest:",
  complete: "Done:"
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function lineColor(index) {
  return `var(--l${(index % 8) + 1})`;
}

function validItem(item) {
  return item && typeof item.id === "string" && item.id
    && typeof item.title === "string" && typeof item.summary === "string"
    && typeof item.activity === "string" && Object.hasOwn(STATE_LABELS, item.state)
    && Number.isInteger(item.progress) && item.progress >= 0 && item.progress <= 100;
}

function loadTracker() {
  return fetch(`./progress.json?v=${Date.now()}`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.streams) || !data.streams.length || !Array.isArray(data.updates)
        || !data.streams.every(function ok(s) { return validItem(s) && (s.substreams || []).every(ok); })) {
        throw new Error("The progress data has an invalid format.");
      }
      return data;
    });
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`));
}

// Plain progress bar, with the area's smaller steps listed underneath as links.
function makeStrip(item, color, stops) {
  const wrap = el("div", "bar-wrap");
  const head = el("div", "bar-head");
  head.append(el("span", "", "Progress"), el("strong", "", `${item.progress}%`));
  const bar = el("div", "bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", `${item.title}: about ${item.progress}%`);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(item.progress));
  const fill = el("span");
  fill.style.width = `${item.progress}%`;
  if (item.progress === 100) fill.className = "full";
  bar.append(fill);
  wrap.append(head, bar);
  if (stops.length) {
    const list = el("p", "steps");
    list.append(document.createTextNode("Includes: "));
    stops.forEach((stop, i) => {
      const a = el("a", "", stop.title);
      a.href = `project.html?id=${encodeURIComponent(stop.id)}`;
      list.append(a);
      if (i < stops.length - 1) list.append(document.createTextNode(", "));
    });
    wrap.append(list);
  }
  return wrap;
}

// **bold**, *italic*, [text](https://...), "- " lists and blank-line paragraphs. Built as DOM nodes, never as HTML.
function appendInline(parent, text) {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(last, match.index)));
    if (match[1]) parent.append(el("strong", "", match[1]));
    else if (match[2]) parent.append(el("em", "", match[2]));
    else {
      const a = el("a", "", match[3]);
      a.href = match[4];
      a.rel = "noopener";
      parent.append(a);
    }
    last = match.index + match[0].length;
  }
  parent.append(document.createTextNode(text.slice(last)));
}

function makeRichText(className, text) {
  const box = el("div", className);
  text.split(/\n\s*\n/).forEach((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => line.startsWith("- "))) {
      const list = el("ul");
      lines.forEach((line) => { const li = el("li"); appendInline(li, line.slice(2)); list.append(li); });
      box.append(list);
    } else {
      const para = el("p");
      lines.forEach((line, i) => { if (i) para.append(el("br")); appendInline(para, line); });
      box.append(para);
    }
  });
  return box;
}

function makeNow(item, className) {
  const now = el("p", className);
  now.append(el("b", "", NOW_LABELS[item.state]), document.createTextNode(` ${item.activity}`));
  return now;
}
