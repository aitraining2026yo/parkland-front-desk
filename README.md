# Parkland 前台工具箱

電腦版前台速查：WhatsApp 回覆模板（可改字再複製）、學費表、8 堂送樂器推廣圖、學生守則、POS 教學。  
頂部紅／黃條顯示**香港天文台**現行天氣警告，每 **5 分鐘**自動更新。  
「各分校開工收工時間」tab：24 小時制；非常規時間（非 12:00–21:00／09:00–18:00）琥珀色 highlight。

## 使用

開 GitHub Pages 網址（推送後約 1 分鐘生效）：

`https://aitraining2026yo.github.io/parkland-front-desk/`

或：`https://aitraining2026yo.github.io/parkland-front-desk/web/`

用 **Chrome / Edge**。撳「複製文字／複製圖片」後去 WhatsApp 貼上。

## 資料夾

| 路徑 | 內容 |
|------|------|
| `web/` | 網站 |
| `01-WhatsApp回覆模板/` | 原文 Word（2026-08-01） |
| `02-學生守則與政策/` | 守則 PDF、天氣圖 |
| `03-課程學費表/` | 價目 |
| `04-推廣_8堂送樂器/` | 推廣圖 |
| `05-POS教學/` | POS 操作 PDF／短片 |

## 回覆模板來源

- 檔案：`01-WhatsApp回覆模板/PT_WHATSAPP_回覆_2026-08-01.docx`
- 網頁資料：`web/data/templates.json`（已跟 doc 全文 + emoji 對齊）
- 共 **17** 條（含提老師／提學生／Confirm 新生／老師簽約）

## POS 教學

- 現有：`05-POS教學/POS_開overpaid單.pdf`
- 之後加 PDF：放入 `05-POS教學/`，再喺 `web/data/assets.json` → `pos.pdfs` 加一筆
- 之後加短片：放入 `05-POS教學/`（`.mp4`／`.webm`），喺 `pos.videos` 加一筆

## 本地預覽（可選）

```bash
cd ~/front-desk-kit && python3 -m http.server 8766
# 開 http://127.0.0.1:8766/web/
```
