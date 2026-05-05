import PSD from "psd";
import sharp from "sharp";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const input = "../assets/psds/icon.psd";
const outDir = "../icons";
const sizes = [128, 64, 32];

await fsp.mkdir(outDir, { recursive: true });
const psd = await PSD.open(input);
psd.parse();
doIt().then(() => console.log("did it!"));

async function doIt() {
  await psd.image.saveAsPng("../icons/icon-1024.png");
  console.log("created icon-1024.png!");
  for (const size of sizes) {
    const readable = fs.createReadStream("../icons/icon-1024.png");
    const writable = fs.createWriteStream(`${ outDir }/icon-${ size }.png`);
    const transformer = sharp()
      .resize({
        width: size,
        height: size,
        fit: "cover",
        kernel: "mks2021"
      })
      .sharpen();
    await pipeline(readable, transformer, writable);
    console.log(`created icon-${ size }.png!`);
    // readable
    //   .pipe(transformer)
    //   .pipe(writable)
    //   .on("ready", () => console.log(`created icon-${ size }.png!`))
    //   .on("error", e => console.error(e));
  }
}