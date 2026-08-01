import type {EpisodeVersion} from "./data/episode";
import {type Subtitles} from "./data/subtitles";

interface HardSub {
  url: string,
  hlang: string
}

interface HardSubs {
  [lang: string]: HardSub
}

type VideoToken = string;

navigation.addEventListener("currententrychange", (e) => {
  const from = getGuid(e.from.url ?? "");
  const to = getGuid(navigation.currentEntry?.url ?? "");
  if (!(from !== to && to)) {
    return;
  }
  delete (window as any).__dualSubsSubtitles;
  void doOps();
});

void doOps();

(window as any).opPlayback = {
  getAccessToken,
  deleteVideoToken,
  getPlayback,
  getManifest
}

function getGuid(url: string) {
  const match = url.match(/watch\/([^\/]+)/);
  return match?.[1];
}

async function doOps() {
  const guid = getGuid(location.href);
  if (!guid) return;
  console.log(`[op playback] guid is ${guid}`);

  const token = await getAccessToken();
  console.log(`[op playback] retrieved access token (len=${token.length})`);

  const versions = await getManifest(guid, token).catch(e => {
    console.error("[op playback] failed to getManifest", e);
    return null;
  });
  if (!versions) return;
  console.log(`[op playback] loaded manifest`, versions);

  const currentVersion = versions.filter(v => v.guid === guid)[0];
  if (!currentVersion) {
    console.error("[op playback] current version not found in the manifest");
    return;
  }
  if (currentVersion.original) {
    console.log("[op playback] aborting operation", currentVersion);
    return;
  }
  const originalVersion = versions.filter(v => v.original)[0];
  if (!originalVersion) {
    console.error("[op playback] original version not found in the manifest");
    return;
  }
  const [_, subtitles, videoToken] = await getPlayback(originalVersion.guid, token);
  await deleteVideoToken(originalVersion.guid, videoToken, token);
  console.log("[op playback] deleted video token", videoToken);
  (window as any).__dualSubsSubtitles = subtitles;
  console.log("[op playback] subtitles loaded", subtitles);
}

async function getAccessToken(): Promise<string> {
  const url = "https://www.crunchyroll.com/auth/v1/token?dual_sub=676767";
  const deviceId = (await cookieStore.get("device_id"))?.value;
  console.log("[op playback] device id is", deviceId);

  const userAgent = navigator.userAgent;

  let browser;
  if (/Firefox/.test(userAgent)) browser = "Firefox";
  else if (/Safari/.test(userAgent)) browser = "Safari";
  else if (/Edge/.test(userAgent)) browser = "Edge";
  else browser = "Chrome";

  let os;
  if (/Linux/.test(userAgent)) os = "Linux";
  else if (/Mac/.test(userAgent)) os = "Mac";
  else os = "Windows";

  console.log(`[op playback] device type is "${browser} on ${os}"`)

  const response = await fetch(url, {
    headers: {
      "Authorization": "Basic bm9haWhkZXZtXzZpeWcwYThsMHE6",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent
    },
    credentials: "include",
    method: "POST",
    body: new URLSearchParams({
      "grant_type": "etp_rt_cookie",
      "device_id": deviceId!,
      "device_type": `${browser} on ${os}`
    })
  });

  if (!response.ok) throw new Error("failed to getAccessToken");
  const json = await response.json();
  return json["access_token"];
}

async function deleteVideoToken(guid: string, videoToken: VideoToken, token: string) {
  const url = `https://www.crunchyroll.com/playback/v1/token/${guid}/${videoToken}?dual_sub=676767`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
    credentials: "omit",
    method: "DELETE"
  });
  if (!response.ok) throw new Error("failed to deleteVideoToken");
}

async function getManifest(guid: string, token: string): Promise<(EpisodeVersion & {original: boolean})[]> {
  const url = `https://www.crunchyroll.com/content/v2/cms/objects/${guid}?dual_sub=676767`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
    credentials: "omit"
  });
  if (!response.ok) throw new Error("failed to getManifest");
  const json = await response.json();
  const meta = json.data[0].episode_metadata;

  return (meta.versions ?? []).map((v: any) => ({
    audioLocale: v.audio_locale,
    guid: v.guid,
    seasonGuid: v.season_guid,
    original: Boolean(v.original)
  }));
}

async function getPlayback(guid: string, token: string): Promise<[HardSubs, Subtitles, VideoToken]> {
  const url = `https://www.crunchyroll.com/playback/v3/${guid}/web/${__BROWSER_TYPE__}/play?dual_sub=676767`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "x-cr-tab-id": sessionStorage.getItem("cx-tab-id")!
    },
    credentials: "omit"
  });
  if (!response.ok) throw new Error("failed to getPlayback");
  const json = await response.json();
  return [json["hardSubs"] as HardSubs, json["subtitles"] as Subtitles, json["token"]];
}