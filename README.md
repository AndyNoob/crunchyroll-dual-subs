# Crunchyroll Dual Sub
![](https://hackatime.hackclub.com/api/v1/badge/U07A64GBPV1/AndyNoob/crunchyroll-dual-subs)<br>
Web extension created to fix the annoying issue of not being able to use `English` and `English [CC]` subtitles at the same time[^1]. The extension is still in development but is guaranteed to work on shows such as One Piece where there are both types of subtitles. This extension supports [Croptix](https://github.com/stratumadev/croptix) and [Improve Crunchyroll](https://github.com/ThomasTavernier/Improve-Crunchyroll).

## How it works
When the Crunchyroll watch page is loaded, the extension intercepts and reads your profile for your preferred/selected subtitle language and type (if you don't have one set via the drop-down or unless you use Chrome... see below). The extension retrieves the episode's subtitle data in the same manner. The alternate subtitle will then be loaded and rendered accordingly by the extension.

> ~~Because of Chrome's recent efforts to fight ad blockers, the extension can't intercept information being loaded by the watch page. Instead, it will fetch the information (redundantly) from Crunchyroll. Don't worry, this won't affect your normal watch experience.~~ 
> Fixed as of `0.10.0`.

The extension adds a drop-down menu for you to select your desired secondary subtitle. The choice is saved for your selected profile to the sync-ed storage (if it is enabled). As of `0.10.0`, a pop-up menu is provided by the extension for scoped preference control (per season, per episode, global). In the menu, you can apply an offset to the timing of both primary and secondary subtitles. 

## Caveats
~~While the extension is able to process most types of subtitle formats (Crunchyroll doesn't use a unified type of subtitle file), the rendering system is very limited. As such, it is recommended that you **choose the none-CC version** as your preferred/selected subtitle in the player. That way, the extension's renderer won't struggle displaying the more complicated typesettings (and trust me, it's not pretty).~~

As of version `0.10.0`, the extension supports the rendering of non-CC subtitles.

## Privacy notice
Everything stays on your computer/browser. The extension does not communicate with any external servers other than Crunchyroll's services.

## Credits
While not completely vibe-coded, this project was made with the help of GPT-5.3/5.5. Prior to version `0.10.0`, this project used [frazy-parser](https://github.com/ApayRus/frazy-parser) by [ApayRus](https://github.com/ApayRus) to parse subtitle files. As of version `0.10.0`, [ASSJS](https://github.com/weizhenye/ASS) by [weizhenye](https://github.com/weizhenye) is used to render ASS subtitles, and [srt-vtt-parser](https://github.com/plussub/srt-vtt-parser) by [plussub](https://github.com/plussub) is used to parse VTT subtitle files. 

## How to build
1. `npm install`
2. `npm run build`, default browser is firefox, change this behavior by prepending `BROWSER=chrome` to the command
3. Find archive in `dist-zip/` or built files in `dist/`

[^1]: See Reddit posts: [post1](https://www.reddit.com/r/Crunchyroll/comments/1qpmdz0/english_subtitles_vs_english_cc_not_translating/), [post2](https://www.reddit.com/r/Crunchyroll/comments/1ny0knq/can_you_combine_english_and_english_cc_subtitles/), [post3](https://www.reddit.com/r/Crunchyroll/comments/1r4gjba/so_uhwhy_do_the_closed_captions_suck/), [post4](https://www.reddit.com/r/Crunchyroll/comments/1elybu9/english_cc_subtitles_dont_have_translations_for/)
