import browser from "webextension-polyfill";
import {ADDITIONAL_SUBS_KEYS} from "../../shared";

const key = ADDITIONAL_SUBS_KEYS;

const input = document.getElementById("enable-additional-subs") as HTMLInputElement;
const result = await browser.storage.local.get(key);

input.checked = Boolean(result[key]);

input.addEventListener("change", async () => {
  await browser.storage.local.set({
    [key]: String(input.checked)
  });
});