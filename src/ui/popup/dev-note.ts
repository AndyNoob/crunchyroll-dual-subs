import browser from "webextension-polyfill";

const devNoteKey = "cr-dual-sub-dev-notes";
const devNoteUrl = "https://gist.githubusercontent.com/AndyNoob/49166e0f04f6a9863aed242e07bbcfe9/raw/ccef05b3185aaa820145eb48f89714271cf9fa31/cr-dual-subs-dev-notes.json";

const noteListEl = document.querySelector(".notes-list");
const noteDetailEl = document.querySelector(".note-detail");
const noteTemplate = document.querySelector("#note-template");
const container = document.querySelector(".side-by-side");
const noteDetailTemplate = document.querySelector("#note-detail-template");

async function loadDevNotes(): Promise<{ notes: DevNote[], date: number }> {
  const res = await browser.storage.local.get(devNoteKey);
  return (res[devNoteKey] ?? { notes: [], date: Date.now() }) as { notes: DevNote[], date: number }
}

async function saveDevNotes(notes: DevNote[]): Promise<{ notes: DevNote[], date: number }> {
  const obj = {notes, date: Date.now()};
  await browser.storage.local.set({
    [devNoteKey]: obj
  });
  return obj;
}

init().then().catch(e => {
  console.error("[dual sub dev notes]", e);
});

async function init() {
  initScrollArrowThing();
  let obj = await loadDevNotes();
  if (obj.date - Date.now() < 5 * 60 * 60 * 1000) {
    const res = await fetch(devNoteUrl);
    if (!res.ok) {
      console.error("[dual sub dev notes] failed to grab dev notes", res);
      return;
    }
    obj = await saveDevNotes(await res.json());
  }
  if (!noteListEl
    || !(noteTemplate instanceof HTMLTemplateElement)) return;

  // collapsing the scope option section
  document.querySelector(".dev-notes")!.addEventListener("click", () => {
    let s = container;
    if (!(s instanceof HTMLDivElement)) return;
    s.setAttribute('collapsed', String(s.getAttribute('collapsed') === 'false'));
    void s.offsetWidth;
  });

  noteListEl.replaceChildren();
  for (let note of obj.notes) {
    const fragment = noteTemplate.content.cloneNode(true) as DocumentFragment;
    const el = fragment.firstElementChild as HTMLElement;
    el.querySelector("span")!.textContent = note.title;
    el.querySelector("p")!.textContent = note.message;
    el.addEventListener("click", () => {
      container?.scroll({
        top: 0,
        left: container.scrollWidth,
        behavior: "smooth",
      });
      handleNoteClicked(note);
    });
    noteListEl.append(el);
  }
}

function initScrollArrowThing() {
  const all = document.querySelectorAll('.scroll-down-arrow');

  for (let list of all) {
    const update = () => {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 10;
      if (atBottom) list.classList.add("at-bottom");
      else list.classList.remove("at-bottom");
    };

    list.addEventListener('scroll', update);
    update(); // run once on load
  }
}

function handleNoteClicked(note: DevNote) {
  if (!(noteDetailEl instanceof HTMLElement)
    || !(noteDetailTemplate instanceof HTMLTemplateElement)) return;
  const fragment = noteDetailTemplate.content.cloneNode(true) as DocumentFragment;
  const el = fragment.firstElementChild as HTMLElement;
  el.querySelector(".note-detail-date")!.textContent = new Date(note.date)
    .toLocaleDateString(undefined, { timeZone: "UTC" });
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