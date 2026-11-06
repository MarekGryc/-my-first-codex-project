# Český Tennis

A browser-based 1980s-inspired tennis game in Czech flag colours, with a Czech lion emblem. Play against the computer or a friend; first to seven wins.

Open `index.html` in a modern browser. No installation or build is required.

Alternatively, from this directory run `python3 -m http.server 8000` and open the local server in your browser.

- **Move:** Up/Down arrows, W/S, mouse, or touch on the court.
- **Start / pause / resume:** Space, or the on-screen buttons.
- **Sound:** Toggle SOUND ON for synthesized arcade effects.
- **Music:** The game plays a browser-synthesized rendition of the *Vltava* theme from Bedřich Smetana’s *Má vlast*. Toggle MUSIC ON/OFF at any time.
- **Reset:** Start a fresh match.
- **Play with a friend:** Select **HOST A MATCH**, then let your friend scan the QR code. The host plays red; the friend plays white. The short-lived match uses a direct browser-to-browser connection.

The site deploys to GitHub Pages at `https://marekgryc.github.io/-my-first-codex-project/`. GitHub Pages must be enabled for the repository before the first deployment.

The game pauses automatically when the browser window loses focus.
