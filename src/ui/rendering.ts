import {dragging, overlayCanvasContainer, overlayText} from "./overlay";
import {sleep} from "../utils";
import {grabPreference, log, type Tracks} from "../content";
import type {Preference} from "../data/preferences";
import ASS from "assjs";
import {parse} from "@plussub/srt-vtt-parser";
import type {Entry} from "@plussub/srt-vtt-parser/dist/types";
import {askMainWorld} from "../world-bridge";

export let videoEl: HTMLVideoElement;

let otherRender: ASS | null = null;
let vttRender: VTTRender | null = null;
let lastRendered = "";

export async function grabVideo() {
  let vid = getVideo();
  let counter = 4;
  while (!vid && counter-- > 0) {
    await sleep(1000);
    vid = getVideo();
  }
  if (!vid) {
    console.warn(`skipping because video player is not found`);
    return Promise.reject(`failed and skipping init on ${location.href}, could not find video player`);
  }

  videoEl = vid as HTMLVideoElement;
  return Promise.resolve();
}

export async function beginRender(tracks: Tracks) {
  log("render initiating...", Object.keys(tracks));
  if (vttRender || otherRender) await shutdownRender();
  let otherSet = false;
  for (let [_, value] of Object.entries(tracks)) {
    if (value.format === "none") continue;
    if (value.format === "vtt") {
      if (vttRender) continue;
      vttRender = new VTTRender(parse(value.content).entries);
      vttRender.renderLoop().then();
      continue;
    }
    if (otherSet) continue;
    otherSet = true;

    if (await askMainWorld<boolean>("CHECK_CROPTIX")) {
      log("detected croptix, will not set up ASS renderer");
      continue;
    }
    otherRender = new ASS(assSpecPatch(value.content), videoEl, {
      container: overlayCanvasContainer
    });
    otherRender.show();
  }
  await updateOffsets(await grabPreference());
  log("render began!", {
    vtt: !!vttRender,
    sweet: otherSet
  });
}

export async function updateOffsets(pref: Preference) {
  if (await askMainWorld<boolean>("CHECK_CROPTIX")) {
    const offset = ((pref.subLanguage === "none" || pref.doCc ? pref.primaryOffsetMs : pref.secondaryOffsetMs) ?? 0) / 1000;
    if (await askMainWorld<boolean>("SET_CROPTIX_OFFSET", {offset: -offset})) { // croptix is inverted (shrug)
      log(`changed offset of croptix to ${offset}sec`);
    } else {
      console.error("[dual-subs] could not change offset of croptix even though it was found");
    }
  } else if (otherRender) {
    otherRender.delay = ((pref.subLanguage === "none" || pref.doCc ? pref.primaryOffsetMs : pref.secondaryOffsetMs) ?? 0) / 1000;
    log(`changed offset of ASSJS to ${otherRender.delay}sec`);
    otherRender.hide();
    await sleep(50);
    otherRender.show();
  }
  if (vttRender) {
    vttRender.setOffsetMs((pref.doCc ? pref.secondaryOffsetMs : pref.primaryOffsetMs) ?? 0);
    log(`changed offset of VTT rendering to ${vttRender.getOffsetMs() / 1000}sec`);
  }
}

export async function shutdownRender() {
  if (otherRender) otherRender.destroy();
  if (vttRender) vttRender.shutdown();
  vttRender = otherRender = null;
  log("successfully shutdown rendering.");
}

function getVideo() {
  return document.querySelector("video") || document.querySelector("iframe")?.contentDocument?.querySelector("video");
}

function cleanSubtitleText(text: string): string {
  const withoutTags = text.replace(/<[^>]*>/g, "");
  return withoutTags
    .replace(/\r/g, "")
    .trim();
}

interface Cue {
  id: string,
  start: number,
  end: number,
  text: string
}

function normalizeCues(parsed: Entry[]): Cue[] {
  return parsed.map((cue: Entry) => ({
    id: cue.id,
    start: cue.from / 1000,
    end: cue.to / 1000,
    text: cleanSubtitleText(cue.text)
  }));
}

function assSpecPatch(str: string): string {
  // i encountered an episode of slime show (41) with a malformed ASS subtitle file
  // GPT-5.3/5.5 proposed this fix for the malformed fade in tag
  return str.replace(
    /\\t\((\d+),(\d+),(\d+)\s+([^}]*)}/g,
    "\\t($1,$2,$3,$4)}"
  );
}

function getActiveCue(cues: Cue[], time: number): Cue | null {
  if (cues.length === 0) return null;
  if (compare(cues[0]!, time) == 0)
    return cues[0] ?? null;
  if (compare(cues[cues.length - 1]!, time) == 0)
    return cues[cues.length - 1] ?? null;

  let index = cues.length / 2;
  let prev = 0;
  let cue: Cue | undefined;
  let comp: number;
  while ((cue = cues[Math.floor(index)]) && (comp = compare(cue, time)) != 0) {
    let diff = Math.abs((index - prev) / 2);
    const nextIndex = comp > 0 ? index - diff : index + diff;
    if (Math.floor(nextIndex) === Math.floor(index)) break;
    prev = index;
    index = nextIndex;
  }
  if (!cue || compare(cue, time) != 0) {
    return null;
  }
  return cue;
}

function compare(cue: Cue, time: number): 0 | -1 | 1 {
  if (cue.start > time || cue.end < time)
    return cue.start > time ? 1 : -1;
  else return 0;
}

export async function shouldSkip() {
  let url: string = location.href;
  if (!url || !url.includes("/watch/")) {
    log(`skipping ${location.href} because the top url is not a watch page`);
    return true;
  }
  return false;
}

class VTTRender {
  private track: Cue[];
  private render: number | null = null;
  private offsetMs: number = 0;

  constructor(track: Entry[]) {
    this.track = normalizeCues(track);
    log(this.track);
  }

  public shutdown() {
    if (this.render != null) {
      cancelAnimationFrame(this.render);
    }
    overlayText.style.display = "none";
  }

  public async renderLoop() {
    this.renderLoop0(this).then();
  }

  public setOffsetMs(val: number) {
    this.offsetMs = val;
  }

  public getOffsetMs() {
    return this.offsetMs;
  }

  private async renderLoop0(renderer: this) {
    if (await shouldSkip()) {
      log("[dual-sub] stopping render loop");
      this.render = null;
      return;
    }
    if (!videoEl || !overlayText) {
      console.error("[dual-sub] overlay or video doesn't exist while rendering");
      this.render = null;
      return;
    }

    const time = videoEl.currentTime;

    const secondaryCue = getActiveCue(renderer.track, time + Number(renderer.offsetMs ?? 0) / 1000);
    const nextText = dragging ? "(right click to reset)" : (secondaryCue?.text || "");

    if (!nextText || nextText !== lastRendered) {
      overlayText.textContent = nextText || "";
      overlayText.style.display = nextText && nextText.length > 0 ? "block" : "none";
      lastRendered = nextText;
    }

    this.render = requestAnimationFrame(() => this.renderLoop0(renderer));
  }

}