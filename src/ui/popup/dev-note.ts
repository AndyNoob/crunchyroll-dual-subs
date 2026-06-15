import browser from "webextension-polyfill";

const devNoteKey = "cr-dual-sub-dev-notes";
const devNoteUrl = "https://gist.githubusercontent.com/AndyNoob/49166e0f04f6a9863aed242e07bbcfe9/raw/ccef05b3185aaa820145eb48f89714271cf9fa31/cr-dual-subs-dev-notes.json";

const noteListEl = document.querySelector(".notes-list");
const noteDetailEl = document.querySelector(".note-detail");
const noteCountEl = document.querySelector("#notes-count");
const noteTemplate = document.querySelector("#note-template");
const container = document.querySelector(".side-by-side");
const noteDetailTemplate = document.querySelector("#note-detail-template");
const enabledCheckbox = document.querySelector("#dev-notes-checkbox") as HTMLInputElement;

async function loadDevNotes(): Promise<DevNoteCache> {
  const res = await browser.storage.local.get(devNoteKey);
  return (res[devNoteKey] ?? {notes: [], date: Date.now(), opened: [], enabled: true}) as DevNoteCache
}

async function saveDevNotes(notes: DevNote[], openedSlugs: string[], enabled: boolean): Promise<DevNoteCache> {
  const obj: DevNoteCache = {notes, date: Date.now(), opened: [...new Set(openedSlugs)], enabled};
  return saveDevNoteCache(obj);
}

async function saveDevNoteCache(cache: DevNoteCache): Promise<DevNoteCache> {
  await browser.storage.local.set({
    [devNoteKey]: cache
  });
  return cache;
}

init().then().catch(e => {
  console.error("[dual sub dev notes]", e);
});

async function subInit(cache: DevNoteCache) {
  if (!noteListEl || !(noteTemplate instanceof HTMLTemplateElement)) return;
  if (!cache.opened) {
    cache.opened = [];
  }
  if (!(noteCountEl instanceof HTMLElement)) return;

  noteCountEl.dataset.notes = cache.enabled ? String(cache.notes.length - cache.opened.length) : "0";
  noteListEl.replaceChildren();

  if (!cache.enabled) return;

  for (let note of cache.notes) {
    const fragment = noteTemplate.content.cloneNode(true) as DocumentFragment;
    const el = fragment.firstElementChild as HTMLElement;
    el.dataset.new = String(!cache.opened.includes(note.slug));
    el.querySelector("span")!.textContent = note.title;
    el.querySelector("p")!.textContent = note.message;
    el.addEventListener("click", () => {
      container?.scroll({
        top: 0,
        left: container.scrollWidth,
        behavior: "smooth",
      });
      handleNoteClicked(note);
      if (!cache.opened.includes(note.slug)) cache.opened.push(note.slug);
      saveDevNoteCache(cache);
      el.dataset.new = "false";
      noteCountEl.dataset.notes = String(cache.notes.length - cache.opened.length);
    });
    noteListEl.append(el);
  }
}

async function init() {
  initScrollArrowThing();

  let cache = await loadDevNotes();
  const tryFetch = async () => {
    if (cache.enabled && cache.date - Date.now() < 5 * 60 * 60 * 1000) {
      const res = await fetch(devNoteUrl);
      if (!res.ok) {
        console.error("[dual sub dev notes] failed to grab dev notes", res);
        return;
      }
      cache = await saveDevNotes(await res.json(), cache.opened, cache.enabled);
    }
  }
  await tryFetch();

  enabledCheckbox.checked = cache.enabled;

  // collapsing the scope option section
  document.querySelector(".dev-notes")!.addEventListener("click", (e) => {
    if (e.target instanceof HTMLElement && e.target.id === enabledCheckbox.id) return;
    let s = container;
    if (!(s instanceof HTMLDivElement)) return;
    s.setAttribute("collapsed", String(!cache.enabled || s.getAttribute("collapsed") === "false"));
    void s.offsetWidth;
  });

  enabledCheckbox!.addEventListener("click", async () => {
    cache.enabled = enabledCheckbox.checked;
    if (cache.enabled) {
      await tryFetch();
    } else {
      container?.setAttribute("collapsed", "true");
    }
    saveDevNoteCache(cache).then(subInit);
  });

  await subInit(cache);
}

function initScrollArrowThing() {
  const all = document.querySelectorAll(".scroll-down-arrow");

  for (let list of all) {
    const update = () => {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 10;
      if (atBottom) list.classList.add("at-bottom");
      else list.classList.remove("at-bottom");
    };

    list.addEventListener("scroll", update);
    const observer = new ResizeObserver(() => update());
    observer.observe(list);
    update(); // run once on load
  }
}

function handleNoteClicked(note: DevNote) {
  if (!(noteDetailEl instanceof HTMLElement)
    || !(noteDetailTemplate instanceof HTMLTemplateElement)) return;
  const fragment = noteDetailTemplate.content.cloneNode(true) as DocumentFragment;
  const el = fragment.firstElementChild as HTMLElement;
  el.querySelector(".note-detail-date")!.textContent = new Date(note.date)
    .toLocaleDateString(undefined, {timeZone: "UTC"});
  el.querySelector(".note-detail-title")!.textContent = note.title;
  el.querySelector(".note-detail-body")!.textContent = note.message;
  el.querySelector(".back-button")!.addEventListener("click", () => {
    container?.scroll({
      top: 0,
      left: 0,
      behavior: "smooth",
    });
  });
  noteDetailEl.replaceChildren(el);
}

interface DevNote {
  slug: string,
  title: string,
  message: string,
  date: string
}

interface DevNoteCache {
  notes: DevNote[],
  date: number,
  opened: string[],
  enabled: boolean
}