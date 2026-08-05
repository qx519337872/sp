import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json({ limit: "25mb" }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// API Route for product card detection
app.post("/api/detect-cards", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64 in request body" });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const ai = getGeminiClient();

    if (!ai) {
      res.json(generateFallbackGridDetection("GEMINI_API_KEY is not configured in Vercel Environment Variables"));
      return;
    }

    let userModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim().replace(/^["']|["']$/g, '');
    if (userModel.includes("3.6")) {
      userModel = "gemini-2.5-flash";
    }

    const candidateModels = [
      userModel,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ].filter(Boolean).filter((m, idx, arr) => arr.indexOf(m) === idx);

    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType,
                },
              },
              {
                text: `You are an expert Computer Vision model analyzing product cards or price tags in an image.
Detect ALL distinct product card/tag rectangles (whether there are 1, 3, 6, 12, or 16 cards).

For EACH card detected:
1. Provide its 2D bounding box [ymin, xmin, ymax, xmax] normalized on 0..1000 scale.
2. Extract the card label or tag code (e.g. 'A654').
3. Extract the price or amount:
   - If price shows an expression like '3+2', '3*2', or '3x2', calculate MULTIPLICATION (3 * 2 = 6). Return 6.
   - If price is a single number like '560', '220', return 560 or 220.
   - If gift/freebie (0 price), return 0.
4. Extract date on the card in M/D format (e.g. '7/30', '7/31').`,
              },
            ],
          },
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      box_2d: {
                        type: Type.ARRAY,
                        items: { type: Type.INTEGER }
                      },
                      label: { type: Type.STRING },
                      amount: { type: Type.STRING, description: "Numeric string or evaluated math value" },
                      date: { type: Type.STRING },
                      confidence: { type: Type.NUMBER }
                    },
                    required: ["box_2d"]
                  }
                },
                summary_date: { type: Type.STRING },
                total_amount: { type: Type.NUMBER }
              },
              required: ["cards"]
            }
          }
        });
        if (response && response.text) {
          break; // Successfully got response
        }
      } catch (err: any) {
        console.warn(`Model '${modelName}' failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!response || !response.text) {
      console.error("All Gemini models failed. Last error:", lastError);
      res.status(200).json(generateFallbackGridDetection(`Gemini API 异常: ${lastError?.message || '模型调用失败，请检查 GEMINI_API_KEY 配置'}`));
      return;
    }

    const responseText = response.text || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      res.json(generateFallbackGridDetection("JSON parse error from Gemini output"));
      return;
    }

    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];

    const formattedCards = cards.map((c: any, index: number) => {
      let box: [number, number, number, number] = [0, 0, 1000, 1000];
      if (Array.isArray(c.box_2d) && c.box_2d.length === 4) {
        box = [
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[0]) || 0))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[1]) || 0))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[2]) || 1000))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[3]) || 1000)))
        ];
      }

      // Evaluate amount expression if string like "3+2" or "3x2"
      let valNum: number | string = '';
      if (c.amount !== undefined && c.amount !== null) {
        const rawStr = String(c.amount).trim();
        const exprMatch = rawStr.match(/^(\d+)\s*[\+\*xX×]\s*(\d+)$/);
        if (exprMatch) {
          valNum = parseInt(exprMatch[1], 10) * parseInt(exprMatch[2], 10);
        } else {
          const parsedFloat = parseFloat(rawStr.replace(/[^\d.]/g, ''));
          valNum = !isNaN(parsedFloat) ? parsedFloat : rawStr;
        }
      }

      return {
        id: `card-${index + 1}-${Date.now()}`,
        cardIndex: index + 1,
        box_2d: box,
        label: c.label || `商品 #${index + 1}`,
        amount: valNum,
        date: c.date || '',
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.95
      };
    });

    const totalAmount = formattedCards.reduce((sum: number, card: any) => {
      const num = parseFloat(String(card.amount));
      return sum + (!isNaN(num) ? num : 0);
    }, 0);

    const dNow = new Date();
    const todayMD = `${dNow.getMonth() + 1}/${dNow.getDate()}`;

    // Pick top recurring date extracted across cards if summary_date is missing
    let detectedDate = parsed.summary_date;
    if (!detectedDate) {
      const validDates = formattedCards.map((c: any) => c.date).filter(Boolean);
      detectedDate = validDates[0] || todayMD;
    }

    res.json({
      cards: formattedCards,
      summaryDate: detectedDate,
      totalAmount: parsed.total_amount || totalAmount,
      source: 'gemini',
      rawText: responseText
    });

  } catch (error: any) {
    console.error("Error in /api/detect-cards:", error);
    res.status(200).json(generateFallbackGridDetection(error?.message || "服务器内部错误"));
  }
});

function generateFallbackGridDetection(reason: string) {
  const cards = [];
  const rows = 4;
  const cols = 4;
  let idx = 1;
  const dNow = new Date();
  const todayMD = `${dNow.getMonth() + 1}/${dNow.getDate()}`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const y0 = Math.round((r / rows) * 1000 + 10);
      const y1 = Math.round(((r + 1) / rows) * 1000 - 10);
      const x0 = Math.round((c / cols) * 1000 + 10);
      const x1 = Math.round(((c + 1) / cols) * 1000 - 10);

      cards.push({
        id: `fallback-card-${idx}`,
        cardIndex: idx,
        box_2d: [y0, x0, y1, x1] as [number, number, number, number],
        label: `卡片 #${idx}`,
        amount: '',
        date: todayMD,
        confidence: 0.7
      });
      idx++;
    }
  }

  return {
    cards,
    summaryDate: todayMD,
    totalAmount: 0,
    source: 'fallback',
    message: `使用缺省网格 (原因: ${reason})`
  };
}

export default app;
