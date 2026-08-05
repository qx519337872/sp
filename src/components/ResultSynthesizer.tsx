import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, Share2 } from 'lucide-react';

interface Props {
  originalImageSrc: string;
  totalAmount: number;
  itemCount: number;
  summaryDate: string;
  onRestart: () => void;
}

export const ResultSynthesizer: React.FC<Props> = ({
  originalImageSrc,
  totalAmount,
  itemCount,
  summaryDate,
  onRestart,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [synthesizedUrl, setSynthesizedUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    if (!originalImageSrc) return;

    setIsGenerating(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = originalImageSrc;

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw original background image
      ctx.drawImage(img, 0, 0);

      const shortSide = Math.min(canvas.width, canvas.height);
      const fontSizeBig = Math.round(shortSide * 0.09);
      const fontSizeMid = Math.round(shortSide * 0.055);
      const padding = Math.round(shortSide * 0.035);

      // Format text values
      const totalStr = Number.isInteger(totalAmount)
        ? String(totalAmount)
        : totalAmount.toFixed(2);

      let dateMD = summaryDate;
      if (!dateMD || !dateMD.includes('/')) {
        const dObj = new Date(summaryDate || Date.now());
        dateMD = !isNaN(dObj.getTime())
          ? `${dObj.getMonth() + 1}/${dObj.getDate()}`
          : `${new Date().getMonth() + 1}/${new Date().getDate()}`;
      }
      const countStr = `${itemCount}件`;

      // Fonts: Kalam / Caveat for English numbers/slashes, Ma Shan Zheng for Chinese '件'
      const fontEn = '"Kalam", "Caveat", "Comic Sans MS", cursive';
      const fontCn = '"Ma Shan Zheng", "Kalam", cursive';
      const inkColor = '#1042a8'; // Deep ballpoint blue pen ink

      ctx.save();
      ctx.font = `700 ${fontSizeBig}px ${fontEn}`;
      const totalW = ctx.measureText(totalStr).width;

      ctx.font = `700 ${fontSizeMid}px ${fontEn}`;
      const dateW = ctx.measureText(dateMD).width;

      ctx.font = `700 ${fontSizeMid}px ${fontCn}`;
      const countW = ctx.measureText(countStr).width;
      ctx.restore();

      const leftColW = Math.max(dateW, countW);
      const blockW = leftColW + padding * 0.8 + totalW;
      const blockH = fontSizeMid * 1.2 + fontSizeMid * 1.2;

      const boxX = canvas.width - padding * 1.2 - blockW;
      const boxY = canvas.height - padding * 1.2 - blockH;

      // Soft paper-like clean backdrop pad
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      const r = padding * 0.5;
      ctx.beginPath();
      ctx.moveTo(boxX - padding * 0.4 + r, boxY - padding * 0.4);
      ctx.arcTo(boxX + blockW + padding * 0.4, boxY - padding * 0.4, boxX + blockW + padding * 0.4, boxY + blockH + padding * 0.4, r);
      ctx.arcTo(boxX + blockW + padding * 0.4, boxY + blockH + padding * 0.4, boxX - padding * 0.4, boxY + blockH + padding * 0.4, r);
      ctx.arcTo(boxX - padding * 0.4, boxY + blockH + padding * 0.4, boxX - padding * 0.4, boxY - padding * 0.4, r);
      ctx.arcTo(boxX - padding * 0.4, boxY - padding * 0.4, boxX + blockW + padding * 0.4, boxY - padding * 0.4, r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(210, 210, 210, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Helper function to draw handwritten text character by character with micro-rotations
      const drawHandwrittenText = (
        text: string,
        x: number,
        y: number,
        fSize: number,
        fontFamily: string,
        angleDeg: number
      ) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((angleDeg * Math.PI) / 180);
        ctx.font = `700 ${fSize}px ${fontFamily}`;
        ctx.fillStyle = inkColor;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        let cursorX = 0;
        const chars = String(text).split('');
        for (let i = 0; i < chars.length; i++) {
          ctx.save();
          const jitterAngle = (Math.sin(i * 1.7) * 2) * (Math.PI / 180);
          ctx.translate(cursorX, Math.cos(i * 2.3) * 0.8);
          ctx.rotate(jitterAngle);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
          cursorX += ctx.measureText(chars[i]).width;
        }
        ctx.restore();
      };

      // Layout exactly like sample image:
      // Left Column Top: Date (7/30)
      // Left Column Bottom: Item Count (3件)
      // Right Side Large: Total Amount (220)
      const leftX = boxX;
      const rightX = boxX + leftColW + padding * 0.8;

      // Top Date: 7/30
      drawHandwrittenText(dateMD, leftX, boxY + fontSizeMid * 0.9, fontSizeMid, fontEn, -2);

      // Bottom Count: 3件
      drawHandwrittenText(countStr, leftX, boxY + fontSizeMid * 0.9 + fontSizeMid * 1.15, fontSizeMid, fontCn, -3);

      // Right Big Total Amount: 220
      drawHandwrittenText(totalStr, rightX, boxY + fontSizeBig * 0.9, fontSizeBig, fontEn, -1.5);

      const url = canvas.toDataURL('image/jpeg', 0.92);
      setSynthesizedUrl(url);
      setIsGenerating(false);
    };
  }, [originalImageSrc, totalAmount, itemCount, summaryDate]);

  const handleDownload = () => {
    if (!synthesizedUrl) return;
    const link = document.createElement('a');
    link.href = synthesizedUrl;
    link.download = `商品卡片账单汇总_${summaryDate || 'today'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto bg-white rounded-3xl p-4 shadow-sm border border-[#ece2e6]">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center gap-2 text-[#34c759] font-bold text-base mb-3">
        <CheckCircle2 className="w-5 h-5" />
        合成完成！
      </div>

      {/* Result Preview */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-[#ece2e6] bg-[#222222] shadow-inner min-h-[260px] flex items-center justify-center mb-4">
        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-white/80 py-12">
            <div className="w-8 h-8 border-4 border-[#d6a5b5] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">正在渲染手写汇总图...</span>
          </div>
        ) : (
          <img
            src={synthesizedUrl}
            alt="合成图像"
            className="w-full max-h-[480px] object-contain block"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating || !synthesizedUrl}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-[#d6a5b5] hover:bg-[#c492a2] text-white font-bold text-xs shadow-md shadow-[#d6a5b5]/30 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          保存合成图片
        </button>

        <button
          type="button"
          onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] text-[#a88892] font-bold text-xs transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          重新选图
        </button>
      </div>
    </div>
  );
};
