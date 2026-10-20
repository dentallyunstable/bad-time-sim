# Bad Time Simulator (Sans Fight)
This project is a clone of the sans fight from [Undertale](http://undertale.com/).

Play in a browser (phones too)
------------------------------
`index.html` is a web version of the game that runs in any modern browser, including Chrome on Android.
It uses the same art, sounds and attack files as the original Construct 2 project, so it needs no extra tools.

* **On a phone:** the left half of the screen is a joystick, the **Z** button confirms and the **X** button goes back
  (hold it to move slowly). The **JUMP** button jumps with the blue heart: tap for a small jump, hold for a higher one.
  It always jumps away from the floor, even when gravity pulls sideways or up. It works sideways (landscape) and upright (portrait). The gear button opens settings
  for joystick size, dead zone (how far you must push before the heart moves), button visibility and the heart hitbox.
* **On a computer:** arrow keys / WASD to move, Z or Enter to confirm, X or Shift to go back, Space to jump.
* To host it, turn on GitHub Pages for this repository (Settings → Pages → deploy from the branch, folder `/`)
  and open the link it gives you. On Android, use Chrome's menu → *Add to Home screen* to get an app-like icon.
* To try it on your own computer, run any static web server in this folder (for example `npx http-server`)
  and open `http://localhost:8080`. Opening `index.html` directly from disk does not work because browsers block loading the attack files that way.

Like in Undertale, the Sans fight has no invincibility frames: staying inside bones keeps hurting you, and KARMA (KR)
keeps draining HP after a hit.

Known Issues
------------
- Sans dialog is missing. I may add something at some future date, but I have no intention of putting the original text in, as it really only makes sense in the context of the whole game.

Fixed in the web version
------------------------
- The heart hitbox is now an 8x8 box around the centre of the heart (closer to Undertale) instead of a single point.
  The old behaviour can be chosen in the settings.
- On sans_platforms4 and sans_platforms4hard, the platform now speeds up from 0 to its full speed.
- Orange bones now hurt you when you are standing still (and not when moving), like in Undertale.
