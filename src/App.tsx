import React, { useState, useRef, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { CardCanvasOverlay } from './components/CardCanvasOverlay';
import { CardEditorList } from './components/CardEditorList';
import { ResultSynthesizer } from './components/ResultSynthesizer';
import { DetectedCard, DetectionResult } from './types';
import { ScanSearch, Camera, Image as ImageIcon, Check, ArrowLeft, RefreshCcw, Sparkles, X, Plus, Trash2, Calendar, DollarSign } from 'lucide-react';

const getTodayMD = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const compressImageForDetection = (base64Str: string, maxDim = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = base64Str;
    img.onload = () => {
      let width = img.width || 800;
      let height = img.height || 800;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.70));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export default function App() {
  const [step, setStep] = useState<'upload' | 'verify' | 'edit' | 'result'>('upload');
  const [imageSrc, setImageSrc] = useState<string>('');
  const [cards, setCards] = useState<DetectedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState<string>(getTodayMD());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detectionSource, setDetectionSource] = useState<'gemini' | 'fallback'>('gemini');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Handle uploaded image
  const handleImageSelected = async (base64: string) => {
    setImageSrc(base64);
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Downscale image payload for high speed recognition (800px max)
      const compressedBase64 = await compressImageForDetection(base64, 800);

      const response = await fetch('/api/detect-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const result: DetectionResult = await response.json();

      setCards(result.cards || []);
      if (result.summaryDate) {
        setSummaryDate(result.summaryDate);
      }
      setDetectionSource(result.source || 'gemini');

      if (result.cards && result.cards.length > 0) {
        setSelectedCardId(result.cards[0].id);
      }

      setStep('verify');
    } catch (err: any) {
      console.error('Card detection error:', err);
      setErrorMsg(err.message || '卡片识别失败，已自动生成缺省网格卡片');

      const todayMD = getTodayMD();
      const fallbackCards: DetectedCard[] = Array.from({ length: 16 }).map((_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        return {
          id: `fallback-${i + 1}`,
          cardIndex: i + 1,
          box_2d: [row * 250 + 10, col * 250 + 10, (row + 1) * 250 - 10, (col + 1) * 250 - 10],
          label: `卡片 #${i + 1}`,
          amount: '',
          date: todayMD,
        };
      });

      setCards(fallbackCards);
      setStep('verify');
    } finally {
      setIsLoading(false);
    }
  };

  // Card list mutations
  const handleUpdateCard = (id: string, field: keyof DetectedCard, value: any) => {
    let valToSave = value;
    if (field === 'amount' && typeof value === 'string') {
      const rawStr = value.trim();
      if (rawStr.includes('=')) {
        const parts = rawStr.split('=');
        const rightPart = parts[parts.length - 1].trim();
        const rightNum = parseFloat(rightPart.replace(/[^\d.]/g, ''));
        if (!isNaN(rightNum)) {
          valToSave = rightNum;
        }
      } else {
        const exprMatch = rawStr.match(/^(\d+(?:\.\d+)?)\s*[\+\*xX×]\s*(\d+(?:\.\d+)?)$/);
        if (exprMatch) {
          const n1 = parseFloat(exprMatch[1]);
          const n2 = parseFloat(exprMatch[2]);
          if (!isNaN(n1) && !isNaN(n2)) {
            valToSave = n1 * n2;
          }
        }
      }
    }

    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: valToSave } : c))
    );
  };

  const handleDeleteCard = (id: string) => {
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.map((c, idx) => ({ ...c, cardIndex: idx + 1 }));
    });
    if (selectedCardId === id) {
      setSelectedCardId(null);
    }
  };

  const handleAddCard = () => {
    const newIndex = cards.length + 1;
    const newCard: DetectedCard = {
      id: `custom-card-${Date.now()}`,
      cardIndex: newIndex,
      box_2d: [300, 300, 700, 700],
      label: `商品 #${newIndex}`,
      amount: '',
      date: summaryDate,
    };
    setCards((prev) => [...prev, newCard]);
    setSelectedCardId(newCard.id);
  };

  const handleRestart = () => {
    setStep('upload');
    setImageSrc('');
    setCards([]);
    setSelectedCardId(null);
    setErrorMsg(null);
  };

  const totalAmount = cards.reduce((sum, c) => {
    const val = parseFloat(String(c.amount));
    return sum + (!isNaN(val) && val > 0 ? val : 0);
  }, 0);

  // Draw overlay canvas for verify modal
  useEffect(() => {
    if (step === 'verify' && imageSrc && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        cards.forEach((card, idx) => {
          const [ymin, xmin, ymax, xmax] = card.box_2d;
          const x = (xmin / 1000) * img.width;
          const y = (ymin / 1000) * img.height;
          const w = ((xmax - xmin) / 1000) * img.width;
          const h = ((ymax - ymin) / 1000) * img.height;

          const isSelected = selectedCardId === card.id;

          // Green card boundary box
          ctx.fillStyle = isSelected ? 'rgba(52, 199, 89, 0.12)' : 'rgba(52, 199, 89, 0.05)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = isSelected ? '#34c759' : 'rgba(52, 199, 89, 0.8)';
          ctx.lineWidth = Math.max(3, Math.round(img.width / 500));
          ctx.strokeRect(x, y, w, h);

          // Card Badge label
          const fs = Math.max(14, Math.round(img.width / 120));
          ctx.font = `bold ${fs}px sans-serif`;
          const labelText = `#${card.cardIndex} ${card.label || ''} ${card.amount ? '¥' + card.amount : ''}`;
          const labelWidth = ctx.measureText(labelText).width + 12;
          ctx.fillStyle = '#34c759';
          ctx.fillRect(x, y, labelWidth, fs + 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(labelText, x + 6, y + fs + 3);

          // Red amount box tag
          if (card.amount !== undefined && card.amount !== '') {
            ctx.strokeStyle = '#ff3b30';
            ctx.lineWidth = Math.max(2, Math.round(img.width / 600));
            ctx.strokeRect(x + 4, y + h - fs * 2 - 4, w - 8, fs * 2);
            ctx.fillStyle = '#ff3b30';
            ctx.font = `bold ${Math.max(12, fs - 2)}px sans-serif`;
            ctx.fillText(`金额: ¥${card.amount}`, x + 8, y + h - 8);
          }
        });
      };
      img.src = imageSrc;
    }
  }, [step, imageSrc, cards, selectedCardId]);

  return (
    <div className="min-h-screen bg-[#f7f2f4] text-[#4a2e3a] font-sans flex flex-col items-center justify-center p-3 sm:p-6">
      {/* Mobile Card Layout Shell */}
      <div className="w-full max-w-[440px] bg-white rounded-[32px] shadow-2xl border border-[#f0e6ea] p-5 sm:p-7 flex flex-col min-h-[580px] relative overflow-hidden">
        
        {/* App Title Header (Only show on verify/edit/result steps) */}
        {step !== 'upload' && !isLoading && (
          <div className="flex items-center justify-between pb-4 border-b border-[#f0e6ea] mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#d6a5b5] text-white flex items-center justify-center shadow-md">
                <ScanSearch className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-base text-[#4a2e3a] tracking-tight">账单识别</h1>
              </div>
            </div>
          </div>
        )}

        {/* LOADING INDICATOR */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center my-auto">
            <div className="w-12 h-12 border-4 border-[#f0e6ea] border-t-[#d6a5b5] rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold text-[#4a2e3a]">正在识别图片中...</p>
          </div>
        )}

        {/* STEP 1: HOME / UPLOAD PAGE */}
        {!isLoading && step === 'upload' && (
          <div className="flex-1 flex flex-col justify-center my-auto py-2">
            <ImageUploader onImageSelected={handleImageSelected} isLoading={isLoading} />
          </div>
        )}

        {/* STEP 2: VERIFY BOUNDING BOX OVERLAY MODAL */}
        {!isLoading && step === 'verify' && (
          <div className="flex-1 flex flex-col">
            <div className="bg-[#faf5f7] rounded-2xl p-3 mb-3 border border-[#ece2e6]">
              <h2 className="text-xs font-bold text-[#4a2e3a] mb-1">🔍 请核对识别框与卡片列表</h2>
              <div className="flex items-center gap-3 text-[11px] text-[#a88892]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#34c759] inline-block"/>绿框=卡片</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#ff3b30] inline-block"/>红框=金额</span>
              </div>
            </div>

            {/* Interactive Canvas */}
            <div className="flex-1 min-h-[220px] max-h-[300px] bg-slate-900 rounded-2xl overflow-hidden relative mb-4 flex items-center justify-center shadow-inner">
              <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
            </div>

            <div className="text-xs text-[#a88892] text-center mb-3">
              已检测到 <strong className="text-[#4a2e3a]">{cards.length}</strong> 张商品卡片
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 py-3 px-3 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] text-[#a88892] text-xs font-medium transition-colors"
              >
                ⚠️ 重新选择照片
              </button>
              <button
                type="button"
                onClick={() => setStep('edit')}
                className="flex-1 py-3 px-3 rounded-full bg-[#d6a5b5] hover:bg-[#c492a2] text-white text-xs font-bold shadow-md shadow-[#d6a5b5]/30 transition-colors"
              >
                ✅ 位置无误，编辑金额
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DRAWER / CARD AMOUNT EDITOR */}
        {!isLoading && step === 'edit' && (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-[#4a2e3a]">✏️ 确认账单明细</h2>
                <span className="text-xs text-[#a88892]">核对每件商品金额与日期</span>
              </div>

              {/* Summary Date Row */}
              <div className="bg-[#faf5f7] p-3 rounded-2xl mb-3 border border-[#ece2e6]">
                <label className="block text-[11px] text-[#a88892] mb-1 font-medium">📅 汇总日期</label>
                <input
                  type="text"
                  value={summaryDate}
                  onChange={(e) => setSummaryDate(e.target.value)}
                  placeholder="如 7/30"
                  className="w-full bg-transparent border-none text-sm font-semibold text-[#4a2e3a] focus:outline-none"
                />
              </div>

              {/* Item List Container */}
              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 mb-3">
                {cards.map((card) => (
                  <div key={card.id} className="bg-[#fcf9fa] border border-[#ece2e6] rounded-xl p-2.5 flex items-center gap-2">
                    <span className="text-xs text-[#a88892] w-5 text-center font-bold">#{card.cardIndex}</span>
                    <input
                      type="text"
                      value={card.amount}
                      onChange={(e) => handleUpdateCard(card.id, 'amount', e.target.value)}
                      placeholder="金额"
                      className="flex-1 bg-white border border-[#ece2e6] rounded-lg px-2.5 py-1.5 text-xs text-[#4a2e3a] focus:border-[#d6a5b5] focus:outline-none font-semibold"
                    />
                    <input
                      type="text"
                      value={card.date || summaryDate}
                      onChange={(e) => handleUpdateCard(card.id, 'date', e.target.value)}
                      placeholder="7/30"
                      className="w-20 bg-white border border-[#ece2e6] rounded-lg px-2 py-1.5 text-xs text-[#4a2e3a] focus:border-[#d6a5b5] focus:outline-none text-center font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteCard(card.id)}
                      className="w-7 h-7 rounded-full bg-[#f7f2f4] hover:bg-[#e8d9df] text-[#b39ba6] flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddCard}
                className="w-full py-2 border-1.5 border-dashed border-[#e2d0d6] rounded-full text-xs text-[#a88892] hover:bg-[#faf5f7] transition-colors mb-3 flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 添加一件商品
              </button>

              {/* Summary Stats Bar */}
              <div className="bg-[#faf5f7] p-3 rounded-2xl flex items-center justify-between mb-4 border border-[#ece2e6]">
                <div>
                  <div className="text-[11px] text-[#a88892]">合计金额</div>
                  <div className="text-xl font-bold text-[#4a2e3a]">¥ {Number.isInteger(totalAmount) ? totalAmount : totalAmount.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#a88892]">总件数</div>
                  <div className="text-base font-bold text-[#4a2e3a]">{cards.length} 件</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="flex-1 py-3 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] text-[#a88892] text-xs font-medium transition-colors"
              >
                返回确认框
              </button>
              <button
                type="button"
                onClick={() => setStep('result')}
                className="flex-1 py-3 rounded-full bg-[#d6a5b5] hover:bg-[#c492a2] text-white text-xs font-bold shadow-md shadow-[#d6a5b5]/30 transition-colors"
              >
                确认无误，合成图片
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: RESULT */}
        {!isLoading && step === 'result' && (
          <div className="flex-1 flex flex-col justify-between py-2">
            <ResultSynthesizer
              originalImageSrc={imageSrc}
              totalAmount={totalAmount}
              itemCount={cards.length}
              summaryDate={summaryDate}
              onRestart={handleRestart}
            />
          </div>
        )}

      </div>
    </div>
  );
}

