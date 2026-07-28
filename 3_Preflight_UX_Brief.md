# Preflight — UX / UI Design Brief

## Direction: flight instrumentation, not another SaaS dashboard

The name is the brief. Preflight should feel like reading an aircraft's instrument panel before takeoff — precise, legible at a glance, dark by default, and built around a real signal system rather than decoration. Every color means something; nothing is there just to look nice.

Explicitly avoid: purple gradients on white, Inter/Roboto/generic system fonts, a generic light SaaS-dashboard look, card-soup layouts with no hierarchy.

## Typography

- **Headers, labels, data readouts:** IBM Plex Mono — technical heritage, highly legible at small sizes, reinforces the "instrument readout" feel.
- **Body copy:** IBM Plex Sans — same family as the mono, so the pairing is cohesive by default without burning design time on it.
- Both are free on Google Fonts — fast to wire up, no licensing detour mid-build.

## Color — the palette is the product

This isn't decoration, it's the verdict language:

- **Background:** near-black graphite/navy, something like `#0A0D12` — not warm-amber-dark (that's Aether's look already; Preflight should read as a different product at a glance).
- **Clear:** phosphor green (`#4ADE80` family)
- **Review:** instrument amber (`#FBBF24` family)
- **Hold:** signal red (`#EF4444` family)
- **Interactive/active accent:** electric cyan (`#38BDF8` family), used sparingly
- **Text:** off-white (`#E4E7EB`), not pure white; dimmer gray for secondary text

Never rely on color alone for a verdict — every badge needs the color, a short label ("Clear" / "Review" / "Hold"), and an icon. This isn't just accessibility-by-the-book: amber-on-dark specifically tends to fail contrast checks if you're not careful. Check it (aim for 4.5:1 on body text), don't assume it.

## Layout

- **Header:** a literal radial gauge for the aggregate trust score — not a progress bar, an actual dial. It's the one element someone will screenshot.
- **Main view:** a vertical timeline of commit cards, each a compact "instrument tile" — verdict color + icon, commit message, timestamp. Newest at top.
- **Detail panel:** clicking a commit opens a panel beside the timeline (not below it) — diff on one side, rationale + flagged checks on the other. Side-by-side keeps "what changed" and "why it got this verdict" connected at a glance.

## Motion

- One deliberate "power-on" sequence on first load: instrument tiles reveal in a quick staggered sequence, like avionics booting — not scattered micro-animations everywhere.
- Verdict badges get a brief "settle" transition on render, like a needle finding its position (150–300ms).
- Respect `prefers-reduced-motion`.

## States that need real design attention, not an afterthought

- **Loading:** instrument-tile skeletons, not a generic spinner — keep the panel aesthetic even while empty.
- **Empty (no repo analyzed yet):** "No flights logged yet" plus the input to analyze one — let the empty state do the onboarding.
- **Error (bad URL / private repo / rate-limited):** specific and actionable — "Can't reach that repo — check it's public" beats a generic failure toast.
