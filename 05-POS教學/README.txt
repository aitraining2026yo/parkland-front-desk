Parkland POS 教學

而家有：
  POS_開overpaid單.pdf  — 點樣開 overpaid 的單

之後加檔：
  · PDF  → 放呢個資料夾，再改 web/data/assets.json 嘅 pos.pdfs
  · 短片 → 放 .mp4 / .webm，改 pos.videos

例（assets.json）：
  "videos": [
    {
      "id": "pos-demo",
      "title": "示範短片",
      "desc": "30 秒示範",
      "file": "../05-POS教學/demo.mp4",
      "search": "POS 示範"
    }
  ]
