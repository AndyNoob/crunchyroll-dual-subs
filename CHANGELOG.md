# 0.4.0
- Bump 0.4.0
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
- Update changelog for



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
