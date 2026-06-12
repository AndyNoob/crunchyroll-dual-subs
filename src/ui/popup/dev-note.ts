import browser from "webextension-polyfill";

const devNoteKey = "cr-dual-sub-dev-notes";
const devNoteUrl = "https://gist.githubusercontent.com/AndyNoob/49166e0f04f6a9863aed242e07bbcfe9/raw/ccef05b3185aaa820145eb48f89714271cf9fa31/cr-dual-subs-dev-notes.json";

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
  let obj = await loadDevNotes();
  if (obj.date - Date.now() < 5 * 60 * 60 * 1000) {
    const res = await fetch(devNoteUrl);
    if (!res.ok) {
      console.error("[dual sub dev notes] failed to grab dev notes", res);
      return;
    }
    obj = await saveDevNotes(await res.json());
  }
  document.body.append(document.createTextNode(JSON.stringify(obj.notes)));
}

interface DevNote {
  slug: string,
  title: string,
  message: string,
  date: string
}