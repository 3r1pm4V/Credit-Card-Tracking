import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Gemini Card Details Search
  app.post("/api/card-details", async (req, res) => {
    const { name, bank } = req.body;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Tìm kiếm thông tin chính xác từ internet về ưu đãi hoàn tiền (cashback) của thẻ tín dụng: ${name} thuộc ngân hàng ${bank}. 
        Trả về kết quả dưới dạng JSON với cấu trúc: 
        { 
          "statementDay": number (ngày chốt sao kê, mặc định 15), 
          "gracePeriod": number (số ngày ân hạn, thường 15, 20, 25, 45), 
          "defaultRate": number (phần trăm hoàn tiền cho các giao dịch thông thường, ví dụ 0.5), 
          "minSpend": number | null (số tiền chi tiêu tối thiểu mỗi tháng để được hoàn tiền, ví dụ 1000000),
          "cashbackRules": [
            { "categories": ["Supermarket", "Transport", "Dining", "Travel", "Digital", "Ecommerce", "Cinema", "Online", "Gas", "Health", "Education", "Utilities"], "rate": number, "cap": number | null }
          ]
        }
        Lưu ý: Bạn phải sử dụng công cụ tìm kiếm để lấy dữ liệu mới nhất từ website chính thức của ngân hàng ${bank}. 
        Đặc biệt lưu ý các danh mục dùng chung hạn mức (shared cap) thì phải gộp chung vào một rule trong mảng cashbackRules. Chỉ trả về JSON.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              statementDay: { type: Type.NUMBER },
              gracePeriod: { type: Type.NUMBER },
              defaultRate: { type: Type.NUMBER },
              minSpend: { type: Type.NUMBER, nullable: true },
              cashbackRules: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    categories: { 
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    rate: { type: Type.NUMBER },
                    cap: { type: Type.NUMBER, nullable: true },
                  },
                  required: ["categories", "rate"]
                }
              }
            }
          }
        }
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to search card details" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
