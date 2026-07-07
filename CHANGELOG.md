# 0.11.5
- Fix series page -> watch page init (AndyNoob)


# 0.11.4
- Fix weird issue with cues randomly not loading (AndyNoob)
- In page control should open popup instead (AndyNoob)
- Load dev notes on first init (AndyNoob)


# 0.11.3
- Have content script cache raw profiles and manifests (AndyNoob)


# 0.11.2
- Refactor episode.ts & loader.ts (AndyNoob)
- Slug based url change detection (AndyNoob)
- Make webpack.js search for module id instead (AndyNoob)
- Fix dev notes url and order of rendered notes (AndyNoob)
- Fix dev note fetch interval... again (AndyNoob)


# 0.11.1
- Look for the module id instead of hard coding it (AndyNoob)
- Add badges for the extension stores (AndyNoob)


# 0.11.0
- Edit 5 files to fix one line to fix subtitle loading... (AndyNoob)
- Fix black magic to yoink api session token. (AndyNoob)
- Fix notes only refreshing within 5 hours... (AndyNoob)
- Update README.md to include the url of the dev notes gist (AndyNoob)
- Remove a debug log in dev-note.ts (AndyNoob)
- Add a timeout to getToken (AndyNoob)
- Add ability to toggle off dev notes (AndyNoob)
- Conjure dark magic to probe Crunchy's code for API token (AndyNoob)
- Maybe implemented rest of dev note. Minus disable button (AndyNoob)
- Do not make background script trigger content script init (AndyNoob)
- Base implementation of dev notes (AndyNoob)
- Add collapsing to scope based options & re-org functions, css (AndyNoob)
- Actually fix croptix-subtitle communication with iso world (AndyNoob)
- Make background script trigger content script init (AndyNoob)


# 0.10.6
- Fix errors in firefox (AndyNoob)


# 0.10.5
- Update .gitignore (AndyNoob)
- Maybe fix #1, make sure to sleep after requesting hack (AndyNoob)
- Handle patch multi-profile requests to fix #2 (AndyNoob)
- Fix CHANGELOG.md for like the 5th time (AndyNoob)


# 0.10.4
- Save last selected scope in popup menu (AndyNoob)
- Restyle popup page to be more compact! (AndyNoob)
- Fix token play heads hack (AndyNoob)
- Change formatting in README.md (AndyNoob)
- Fix CHANGELOG.md again (AndyNoob)


# 0.10.3
- Hide overlayText in shutdownRender (AndyNoob)
- Fix ASS rendering having timing issues after switching eps (AndyNoob)
- Fix Firefox compatibility (AndyNoob)
- Mark subtitles as loading when cleared by background (AndyNoob)
- Extract token out of monkey patched requests (AndyNoob)
- Add cache purging (AndyNoob)


# 0.10.1
- Defer to using communication lang if subtitle lang is not found (AndyNoob)
- Update permissions in manifest (AndyNoob)
- Reorganize folder structure (AndyNoob)
- Fix some lifecycle issues; fix Element.animate exploding (AndyNoob)
- Add new screenshot (AndyNoob)


# 0.10.0
- Fix audio switching & the offset being chosen sometimes (AndyNoob)
- Hacky patch for some malformed ASS files (AndyNoob)
- Re-add croptix support (AndyNoob)
- Update README to include new changes (AndyNoob)
- Add ability to offset primary subtitle rendering (AndyNoob)
- Default preference's doCc should be inverted (AndyNoob)
- Hijack hardSubs in playback if croptix isn't found (AndyNoob)
- Credit copilot in croptix-subtitle-hijack.js (AndyNoob)
- Add croptix-subtitle-hijack.js to manifest and rename monkey-patch-fetch.js (AndyNoob)
- Monkey patch fetch! No more 420 stream limits! (AndyNoob)
- Add Croptix SubtitlesOctopus timeOffset hijack helper (AndyNoob)
- Add timer if user is 420 stream limited (AndyNoob)
- Fix two issues (AndyNoob)


# 0.9.0
- Fix overlay and dropdown being above profile switcher (AndyNoob)
- Fix multi-profile and remove popup profile selection (AndyNoob)
- Fix audio switching issues (AndyNoob)
- Fix not being able to unset options (AndyNoob)
- Fix popup not fetching subtitle manifest (AndyNoob)
- Fix subtitle manifest expiry time (AndyNoob)
- Aggressive caching of subtitle cues and manifests (AndyNoob)
- Add functionality to popup (AndyNoob)
- Implement background receiver for popup (AndyNoob)
- Refactor & improvements; fix preferences (AndyNoob)
- Implement scoped preferences (AndyNoob)
- More reorganization, start work on popup functionality (AndyNoob)
- Major refactoring in prep for popups (AndyNoob)
- Fix CHANGELOG.md (again) (AndyNoob)
- Add back missing '- ' at the start of changelogs (AndyNoob)


# 0.8.0
- Clear cues when tab changes (AndyNoob)
- Make it easier to understand subtitle dragging (AndyNoob)
- Fix context menu showing after resetting sub position (AndyNoob)
- Add delay after crunchy-initiated playback fetch (AndyNoob)
- Make subtitles draggable (AndyNoob)
- Code cleanup & don't auto load cues (AndyNoob)
- Use a different icon for update notif (AndyNoob)
- Continue to try to avoid being 420 stream limited (AndyNoob)
- Add update notifier & rename files (AndyNoob)
- Add LICENSE-material-design-icons (AndyNoob)
- Enhance refresh and dropdown (AndyNoob)
- Tweak manifest fetching headers (AndyNoob)
- Simply changelog generation (AndyNoob)
- Update changelog generation logic (AndyNoob)

# 0.7.0
- Don't send outdated cookies when requesting manifests
- Make refresh button rotate continuously
- Add a cue refresh button next to dropdown
- Add a re-fetch mechanism when grabbing manifests

# 0.6.3
- Fix cue refresh sometimes sending the old one
- Refactor interface SubChoices to EpisodeManifest
- Move adm zip types to dev dependencies
- Add privacy section in README.md
- Update how-it-works section in README.md
- Grammatical error in README.md
- Try a different chrome extension upload

# 0.6.2
- Turns out you DON'T need the tabs permission

# 0.6.1
- Add chrome upload to deploy.yml & bump 0.6.1
- Branding update (icons and also README)

# 0.6.0
- Actually build the extension for both browsers in deploy.yml
- Update deploy.yml to account for new archive naming scheme
- Simplify permissions for Firefox/Chrome
- Update icons and add screenshots
- Fix compatibility for Firefox & Chrome
- Fix Chrome compatibility (firefox is probably broken)!
- Fix Crunchyroll CDN randomly 403-forbidding extension requests (bruh)

# 0.5.0
- Add dropdown-showcase.psd & add subtitle is loading message in overlay.ts
- Refactor code in background.ts and handler.ts
- Fix tab update not properly refreshing cues
- Slight aesthetic improvement
- Add explanation for dropdown menu in README
- Fix switching between audio locales
- Fix text overlay always showing & fix options order
- Add basic secondary subtitle selection

# 0.4.1
- Remove a visible debug message

# 0.4.0
- Fix host permissions
- Fix content script url matching
- Change manifest to be fully in vite.config.ts
- Remove attaching of content to all frames in favor of one single content script that is always loaded
- Fix notify refresh not actually stopping when attemptsLeft is zero
- Fix lifecycle issues & start work on subtitle selection
- Refactoring and log message cleanup in content.ts
- A lot of refactoring and work on making the user not get rate limited :- Bump 0.3.1
- Add more content & background communications to ensure that subtitle is loaded ALWAYS
- Use binary search in getActiveCue
- Update README to include frazy-parser credit
- Fix the changelog (deploy.yml)

# 0.2.0
1. Ensure overlays aren't added twice 
2. Make sure playback data requests are sent with proper headers 
3. Enhance content.ts init logic to give buffer for cue loading 
4. Add a video play/pause hack to grab headers when background.ts is reawakened

# 0.1.0
1. Add confirm box to refresh page if subtitle can't be found; 
2. Auto grab profile data if not found; 
3. Per tab cache of subs, profiles, and authorization; 
4. Fix page loading speed;

# 0.0.4
1. Fix AGAIN cues not reloading properly when video changes by detecting tab changing this time

# 0.0.3
1. Fix null error with `window.dualsub`
2. Fix cues not reloading properly when video changes
3. Add console log for cue reload

# 0.0.2
1. fix extension with default Crunchyroll player
