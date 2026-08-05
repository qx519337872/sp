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

// Utility helper to evaluate amount expressions and equations safely
function parseAndEvaluateAmount(amountInput: any): number | string {
  if (amountInput === undefined || amountInput === null || amountInput === '') return '';
  const rawStr = String(amountInput).trim();
  if (!rawStr) return '';

  // 1. If contains equals sign like "3+2=5" or "10*2=20" or "A+B = 120", extract number after '='
  if (rawStr.includes('=')) {
    const parts = rawStr.split('=');
    const rightPart = parts[parts.length - 1].trim();
    const rightNum = parseFloat(rightPart.replace(/[^\d.]/g, ''));
    if (!isNaN(rightNum)) {
      return rightNum;
    }
  }

  // 2. If expression without equals like "3+2", "3*2", "3x2", "3×2", calculate multiplication (3 * 2 = 6)
  const exprMatch = rawStr.match(/^(\d+(?:\.\d+)?)\s*[\+\*xX×]\s*(\d+(?:\.\d+)?)$/);
  if (exprMatch) {
    const num1 = parseFloat(exprMatch[1]);
    const num2 = parseFloat(exprMatch[2]);
    if (!isNaN(num1) && !isNaN(num2)) {
      return num1 * num2;
    }
  }

  // 3. Single number or currency string like "¥560" or "560"
  const parsedFloat = parseFloat(rawStr.replace(/[^\d.]/g, ''));
  if (!isNaN(parsedFloat)) {
    return parsedFloat;
  }

  return rawStr;
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

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType,
      }
    };

    const promptText = `You are an expert Computer Vision model analyzing product cards or price tags in an image.
Detect ALL distinct product card/tag rectangles (whether there are 1, 3, 6, 12, or 16 cards).

For EACH card detected:
1. Provide its 2D bounding box [ymin, xmin, ymax, xmax] normalized on 0..1000 scale.
2. Extract the card label or tag code (e.g. 'A654', 'かおり').
3. Extract the price or amount:
   - If price shows an expression like '3+2', '3*2', or '3x2', calculate MULTIPLICATION (3 * 2 = 6). Return 6.
   - If price is a single number like '560', '220', '440', return 560, 220, 440.
   - If gift/freebie (0 price), return 0.
4. Extract date on the card in M/D format (e.g. '7/30', '7/31').

Return JSON format with a 'cards' array.`;

    const textPart = { text: promptText };

    const configuredModel = process.env.GEMINI_MODEL?.trim();
    const candidateModels = [
      ...(configuredModel ? [configuredModel] : []),
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-3.6-flash"
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    let response: any = null;
    let lastError: any = null;

    // Try with schema first, then without schema if needed
    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [imagePart, textPart],
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
          console.log(`Success using model ${modelName} with schema`);
          break;
        }
      } catch (err: any) {
        console.warn(`Model '${modelName}' with schema failed:`, err?.message || err);
        lastError = err;

        // Try without strict schema
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: [imagePart, textPart],
            config: {
              temperature: 0.1,
              responseMimeType: "application/json",
            }
          });
          if (response && response.text) {
            console.log(`Success using model ${modelName} without schema`);
            break;
          }
        } catch (retryErr: any) {
          console.warn(`Model '${modelName}' without schema failed:`, retryErr?.message || retryErr);
          lastError = retryErr;
        }
      }
    }

    if (!response || !response.text) {
      console.error("All Gemini models failed. Last error:", lastError);
      let rawErr = lastError?.message || '';
      let userFriendlyMsg = `Gemini API 调用异常: ${rawErr || '无法连接 Gemini 服务'}`;
      if (rawErr.includes('429') || rawErr.includes('RESOURCE_EXHAUSTED') || rawErr.includes('Quota')) {
        userFriendlyMsg = 'Gemini API 免费层级调用频次超限 (429 Quota Exceeded)。请等待1-2分钟后再试！';
      } else if (rawErr.includes('API key') || rawErr.includes('401') || rawErr.includes('403') || rawErr.includes('API_KEY_INVALID')) {
        userFriendlyMsg = 'Gemini API_KEY 无效或受限，请在 Vercel 中检查 GEMINI_API_KEY 配置。';
      }
      res.status(200).json(generateFallbackGridDetection(userFriendlyMsg));
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

      // Evaluate amount expression if string like "3+2", "3x2", or equation like "3+2=5"
      const valNum = parseAndEvaluateAmount(c.amount);

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
