import React, { useRef, useEffect, useState } from 'react';
import { DetectedCard } from '../types';
import { Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface Props {
  imageSrc: string;
  cards: DetectedCard[];
  selectedCardId: string | null;
  onSelectCard: (id: string | null) => void;
  onUpdateCardBox?: (id: string, newBox: [number, number, number, number]) => void;
}

export const CardCanvasOverlay: React.FC<Props> = ({
  imageSrc,
  cards,
  selectedCardId,
  onSelectCard,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showAmounts, setShowAmounts] = useState(true);
  const [zoom, setZoom] = useState(1);

  // Load image
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      setImgElement(img);
    };
  }, [imageSrc]);

  // Draw image and bounding boxes on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    canvas.width = naturalWidth;
    canvas.height = naturalHeight;

    // Clear & draw base image
    ctx.clearRect(0, 0, naturalWidth, naturalHeight);
    ctx.drawImage(imgElement, 0, 0, naturalWidth, naturalHeight);

    // Draw bounding boxes for each card
    cards.forEach((card) => {
      const isSelected = card.id === selectedCardId;
      const [ymin, xmin, ymax, xmax] = card.box_2d;

      // Convert 0-1000 scale to pixel dimensions
      const x = (xmin / 1000) * naturalWidth;
      const y = (ymin / 1000) * naturalHeight;
      const w = Math.max(10, ((xmax - xmin) / 1000) * naturalWidth);
      const h = Math.max(10, ((ymax - ymin) / 1000) * naturalHeight);

      // Card Box semi-transparent fill
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(34, 197, 94, 0.08)';
      ctx.fillRect(x, y, w, h);

      // Card Box Bounding Rectangle
      ctx.strokeStyle = isSelected ? '#2563eb' : '#16a34a';
      ctx.lineWidth = isSelected ? Math.max(4, naturalWidth / 250) : Math.max(2.5, naturalWidth / 400);
      ctx.strokeRect(x, y, w, h);

      // Card Header Tag
      const fs = Math.max(13, Math.round(naturalWidth / 65));
      ctx.font = `bold ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      const tagText = `#${card.cardIndex} ${card.label || ''}`.trim();
      const textMetrics = ctx.measureText(tagText);
      const tagPadding = 6;
      const tagW = textMetrics.width + tagPadding * 2;
      const tagH = fs + tagPadding * 2;

      // Draw tag background at top-left of box
      ctx.fillStyle = isSelected ? '#2563eb' : '#16a34a';
      ctx.fillRect(x, y, tagW, tagH);

      // Tag text
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.fillText(tagText, x + tagPadding, y + tagPadding);

      // Draw Amount Badge (Red Box in bottom right of card)
      if (showAmounts && card.amount !== undefined && card.amount !== '') {
        const amtText = `￥${card.amount}`;
        const amtFs = Math.max(14, Math.round(naturalWidth / 60));
        ctx.font = `bold ${amtFs}px sans-serif`;
        const amtMetrics = ctx.measureText(amtText);
        const amtW = amtMetrics.width + 12;
        const amtH = amtFs + 10;

        const amtX = x + w - amtW - 4;
        const amtY = y + h - amtH - 4;

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(amtX, amtY, amtW, amtH);

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(amtText, amtX + 6, amtY + amtH / 2);
      }

      // Draw Date Badge if present (Blue Box)
      if (showLabels && card.date) {
        const dateText = `📅 ${card.date}`;
        const dateFs = Math.max(12, Math.round(naturalWidth / 75));
        ctx.font = `${dateFs}px sans-serif`;
        const dateMetrics = ctx.measureText(dateText);
        const dateW = dateMetrics.width + 10;
        const dateH = dateFs + 8;

        const dateX = x + 4;
        const dateY = y + h - dateH - 4;

        ctx.fillStyle = '#0284c7';
        ctx.fillRect(dateX, dateY, dateW, dateH);

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(dateText, dateX + 5, dateY + dateH / 2);
      }
    });
  }, [imgElement, cards, selectedCardId, showLabels, showAmounts]);

  // Handle canvas click to select card
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // Find card that contains click coordinates
    let clickedId: string | null = null;
    for (const card of cards) {
      const [ymin, xmin, ymax, xmax] = card.box_2d;
      const x0 = (xmin / 1000) * canvas.width;
      const y0 = (ymin / 1000) * canvas.height;
      const x1 = (xmax / 1000) * canvas.width;
      const y1 = (ymax / 1000) * canvas.height;

      if (clickX >= x0 && clickX <= x1 && clickY >= y0 && clickY <= y1) {
        clickedId = card.id;
        break;
      }
    }

    onSelectCard(clickedId);
  };

  return (
    <div className="flex flex-col items-center w-full bg-slate-900 rounded-2xl p-4 shadow-xl border border-slate-800">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between w-full mb-3 gap-2 px-2 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            共识别出 <strong className="text-white text-sm">{cards.length}</strong> 张商品卡片框
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAmounts(!showAmounts)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              showAmounts ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {showAmounts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            金额框
          </button>

          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              showLabels ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            日期框
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.25, 2.5))}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              title="复位"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Canvas View Area */}
      <div
        ref={containerRef}
        className="relative w-full max-h-[600px] overflow-auto rounded-xl bg-slate-950/80 flex justify-center items-center p-2 border border-slate-800"
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
          className="relative inline-block cursor-crosshair max-w-full"
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="max-w-full h-auto rounded shadow-2xl block border border-slate-800"
          />
        </div>
      </div>

      <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded border-2 border-emerald-500 bg-emerald-500/20 inline-block" />
          绿框 = 商品卡片范围
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />
          红框 = 识别金额
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-sky-500 inline-block" />
          蓝框 = 识别日期
        </span>
      </div>
    </div>
  );
};
