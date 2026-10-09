const STATE_LABELS = {
  planning: "Planned",
  "in-progress": "In progress",
  "ready-to-test": "Ready to test",
  "on-hold": "On hold",
  paused: "On hold"
};
const NOW_LABELS = {
  planning: "Planned:",
  "in-progress": "Now:",
  "ready-to-test": "Ready to test:",
  "on-hold": "Latest:",
  paused: "Latest:"
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
        || data.streams.some((s) => !validItem(s) || (s.substreams || []).some((c) => !validItem(c)))) {
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

function makeNow(item, className) {
  const now = el("p", className);
  now.append(el("b", "", NOW_LABELS[item.state]), document.createTextNode(` ${item.activity}`));
  return now;
}
