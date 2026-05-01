# Crunchyroll Dual Sub
![](https://hackatime.hackclub.com/api/v1/badge/U07A64GBPV1/AndyNoob/crunchyroll-dual-subs)<br>
Firefox extension created to fix the annoying issue of not being able to use `English` and `English [CC]` subtitles at the same time[^1]. The extension is in early development but is guaranteed to work on shows such as One Piece where there are both types of subtitles. This extension supports [Croptix](https://github.com/stratumadev/croptix) (Vilos player).

## How it works
When the Crunchyroll watch page is loaded, the extension intercepts and reads your profile for your preferred/selected subtitle language and type. The extension then retrieves the episode's subtitle data in the same manner. Finally, the extension determines the alternate subtitle and loads it. 

Additionally, the extension now adds a drop down menu for you to select your desired secondary subtitle. The choice is saved for your selected profile to the sync-ed storage (if it is enabled). 

## Caveats
While the extension is able to process most types of subtitle formats (Crunchyroll doesn't use a unified type of subtitle file), the rendering system is very limited. As such, it is recommended that you **choose the none-CC version** as your preferred/selected subtitle. That way, the extension's renderer won't struggle displaying the more complicated typesettings. 

## How to build
1. `npm install`
2. `npm run build`
3. Find archive in `dist-zip/` or built files in `dist/`

## Credits
While not completely vibe-coded, this project was made with the help of GPT-5.2/5.3. This project uses [frazy-parser](https://github.com/ApayRus/frazy-parser) by [ApayRus](https://github.com/ApayRus) to parse subtitle files. 

[^1]: See Reddit posts: [post1](https://www.reddit.com/r/Crunchyroll/comments/1qpmdz0/english_subtitles_vs_english_cc_not_translating/), [post2](https://www.reddit.com/r/Crunchyroll/comments/1ny0knq/can_you_combine_english_and_english_cc_subtitles/), [post3](https://www.reddit.com/r/Crunchyroll/comments/1r4gjba/so_uhwhy_do_the_closed_captions_suck/), [post4](https://www.reddit.com/r/Crunchyroll/comments/1elybu9/english_cc_subtitles_dont_have_translations_for/)
