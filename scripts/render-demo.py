from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess

ROOT = Path(__file__).resolve().parents[1]
output = subprocess.check_output(["node", "scripts/demo.mjs"], cwd=ROOT, text=True)
lines = ["$ npx migrate-mcp", "  connected over stdio", "", *output.rstrip().splitlines()]
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 25)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 25)
frames = []
for shown in range(1, len(lines) + 1):
    image = Image.new("RGB", (1280, 760), "#f5d7ca")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((75, 55, 1205, 705), radius=22, fill="#11151c", outline="#384152", width=2)
    draw.ellipse((105, 82, 121, 98), fill="#ff6b6b")
    draw.ellipse((133, 82, 149, 98), fill="#ffd166")
    draw.ellipse((161, 82, 177, 98), fill="#63d471")
    draw.text((640, 90), "migrate-mcp", font=bold, fill="#a8b3cf", anchor="mm")
    y = 130
    for line in lines[:shown]:
        color = "#f07178" if line.startswith("✖") else "#f2cc8f" if line.startswith("⚠") else "#7bdff2" if line.startswith("$") else "#d8dee9"
        draw.text((110, y), line, font=bold if line.startswith(("✖", "⚠", "$")) else font, fill=color)
        y += 35
    frames.append(image)
frames.extend([frames[-1]] * 8)
(ROOT / "docs").mkdir(exist_ok=True)
frames[0].save(ROOT / "docs/demo.gif", save_all=True, append_images=frames[1:], duration=180, loop=0, optimize=True)
for i, frame in enumerate(frames):
    frame.save(ROOT / "docs" / f".demo-{i:03d}.png")
