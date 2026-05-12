Day 33 - I gave an AI a goal and a browser. It clicked, typed, scrolled — and answered. Vision agents are real now.


🚀TechFromZero Series - VisionAgentFromZero


🌐 Try it live: https://computer-use-from-zero.vercel.app


This isn't a Hello World. It's a real vision agent:
📐 Screenshot → Gemini 2.5 Pro → action → Playwright executes → repeat until done


🔗 The full code (with step-by-step commits you can follow):
https://github.com/dev48v/computer-use-from-zero


🧱 What I built (step by step):

1️⃣ Playwright headless Chrome wrapper — `--no-sandbox` + `--disable-dev-shm-usage` so it runs in Docker, base64 screenshot helper

2️⃣ Gemini 2.5 Pro vision call — sends the screenshot + goal + recent history, asks for one next action

3️⃣ Structured JSON output schema — Gemini returns typed action JSON (`click`, `type`, `press`, `scroll`, `goto`, `wait`, `done`), no regex parsing

4️⃣ Action executor — maps each AgentAction to a Playwright call (mouse.click, keyboard.type, mouse.wheel)

5️⃣ The agent loop — `while not done: screenshot → plan → execute → record`. That's it. Three lines of pseudocode

6️⃣ Server-Sent Events stream — every step pushed live to the browser, no WebSocket complexity

7️⃣ Live React viewer — latest screenshot + reasoning sidebar + final answer; watch the agent think in real time

8️⃣ Render Docker deploy — Playwright base image (`mcr.microsoft.com/playwright:v1.49.1-jammy`) has Chromium pre-installed; ~80s build vs 4min on alpine


💡 Every file has detailed comments explaining WHY, not just what. Written for any beginner who wants to learn how vision agents work — with full clarity on each step.

👉 If you're a beginner learning AI agents, clone it and read the commits one by one. Each commit = one concept. Each file = one lesson. Built from scratch, so nothing is hidden.

🔥 This is Day 33 of a 50-day series. A new technology every day. Follow along!

🌐 See all days: https://dev48v.infy.uk/techfromzero.php

#TechFromZero #Day33 #VisionAgent #Gemini #LearnByDoing #OpenSource #BeginnerGuide #100DaysOfCode #AIAgents
