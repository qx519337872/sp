import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, Share2, Image as ImageIcon, Sparkles, Smartphone, Eye } from 'lucide-react';

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

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
      const fontSizeBig = Math.round(shortSide * 0.105);
      const fontSizeMid = Math.round(shortSide * 0.06);
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

      // Authentic Handwritten Fonts (Google Fonts loaded in index.html):
      // Numbers/Slashes: Kalam, Caveat, Long Cang
      // Chinese: Zhi Mang Xing, Long Cang, Ma Shan Zheng
      const fontEn = '"Kalam", "Caveat", "Long Cang", cursive';
      const fontCn = '"Zhi Mang Xing", "Long Cang", "Ma Shan Zheng", cursive';
      
      // Deep blue gel/ballpoint pen ink color matching user sample photo
      const inkColorPrimary = '#0d43b7';
      const inkColorSecondary = '#0b399d';

      ctx.save();
      ctx.font = `700 ${fontSizeBig}px ${fontEn}`;
      const totalW = ctx.measureText(totalStr).width;

      ctx.font = `700 ${fontSizeMid}px ${fontEn}`;
      const dateW = ctx.measureText(dateMD).width;

      ctx.font = `700 ${fontSizeMid}px ${fontCn}`;
      const countW = ctx.measureText(countStr).width;
      ctx.restore();

      const leftColW = Math.max(dateW, countW);
      const blockW = leftColW + padding * 0.9 + totalW;
      const blockH = fontSizeMid * 1.25 + fontSizeMid * 1.25;

      const boxX = canvas.width - padding * 1.2 - blockW;
      const boxY = canvas.height - padding * 1.2 - blockH;

      // Soft paper-like clean backdrop pad with slight rounded corners
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      const r = padding * 0.5;
      ctx.beginPath();
      ctx.moveTo(boxX - padding * 0.5 + r, boxY - padding * 0.5);
      ctx.arcTo(boxX + blockW + padding * 0.5, boxY - padding * 0.5, boxX + blockW + padding * 0.5, boxY + blockH + padding * 0.5, r);
      ctx.arcTo(boxX + blockW + padding * 0.5, boxY + blockH + padding * 0.5, boxX - padding * 0.5, boxY + blockH + padding * 0.5, r);
      ctx.arcTo(boxX - padding * 0.5, boxY + blockH + padding * 0.5, boxX - padding * 0.5, boxY - padding * 0.5, r);
      ctx.arcTo(boxX - padding * 0.5, boxY - padding * 0.5, boxX + blockW + padding * 0.5, boxY - padding * 0.5, r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(210, 210, 210, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Helper function to draw realistic handwritten strokes with ink pressure & organic micro-jitter
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
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        let cursorX = 0;
        const chars = String(text).split('');
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const charW = ctx.measureText(char).width;

          // Double pass drawing to simulate felt-tip blue ink pen stroke weight and subtle ink bleeds
          ctx.save();
          const jitterAngle = Math.sin(i * 1.9 + x) * 2.5 * (Math.PI / 180);
          const jitterY = Math.cos(i * 2.7 + y) * 1.1;

          ctx.translate(cursorX, jitterY);
          ctx.rotate(jitterAngle);

          // Pass 1: Slightly offset ink bleed background
          ctx.fillStyle = inkColorSecondary;
          ctx.globalAlpha = 0.45;
          ctx.fillText(char, 0.6, 0.6);

          // Pass 2: Main vibrant blue pen ink
          ctx.fillStyle = inkColorPrimary;
          ctx.globalAlpha = 0.98;
          ctx.fillText(char, 0, 0);

          ctx.restore();
          cursorX += charW;
        }
        ctx.restore();
      };

      // Layout exactly matching user's photo:
      // Left Top: Date (e.g. 7/30)
      // Left Bottom: Count (e.g. 3件)
      // Right Large: Total Amount (e.g. 220)
      const leftX = boxX;
      const rightX = boxX + leftColW + padding * 0.9;

      // Top Date: 7/30
      drawHandwrittenText(dateMD, leftX, boxY + fontSizeMid * 0.95, fontSizeMid, fontEn, -2);

      // Bottom Count: 3件
      drawHandwrittenText(countStr, leftX, boxY + fontSizeMid * 0.95 + fontSizeMid * 1.25, fontSizeMid, fontCn, -2.5);

      // Right Big Total Amount: 220
      drawHandwrittenText(totalStr, rightX, boxY + fontSizeBig * 0.9, fontSizeBig, fontEn, -1.5);

      const url = canvas.toDataURL('image/jpeg', 0.94);
      setSynthesizedUrl(url);
      setIsGenerating(false);
    };
  }, [originalImageSrc, totalAmount, itemCount, summaryDate]);

  // Save directly to mobile photo gallery via Web Share API
  const handleSaveToGallery = async () => {
    if (!synthesizedUrl) return;

    try {
      // Convert Data URL to Blob -> File
      const res = await fetch(synthesizedUrl);
      const blob = await res.blob();
      const fileName = `账单汇总_${summaryDate.replace('/', '_') || 'today'}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Check if Web Share API supports file sharing (iOS Safari & Android Chrome)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '商品卡片账单汇总',
          text: `账单汇总：${summaryDate} 共${itemCount}件，合计￥${totalAmount}`,
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 3000);
        return;
      }
    } catch (err) {
      console.warn('Web Share failed or cancelled:', err);
    }

    // Fallback: Open preview modal so user can long-press to save directly to Photos album
    setIsPreviewOpen(true);
  };

  // Standard download link fallback
  const handleDownloadFile = () => {
    if (!synthesizedUrl) return;
    const link = document.createElement('a');
    link.href = synthesizedUrl;
    link.download = `商品卡片账单汇总_${summaryDate.replace('/', '_') || 'today'}.jpg`;
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

      {/* Result Preview Box */}
      <div
        onClick={() => setIsPreviewOpen(true)}
        className="relative w-full rounded-2xl overflow-hidden border border-[#ece2e6] bg-[#222222] shadow-inner min-h-[260px] flex items-center justify-center mb-3 cursor-pointer group"
      >
        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-white/80 py-12">
            <div className="w-8 h-8 border-4 border-[#d6a5b5] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">正在渲染蓝墨水手写汇总图...</span>
          </div>
        ) : (
          <>
            <img
              src={synthesizedUrl}
              alt="合成图像"
              className="w-full max-h-[480px] object-contain block"
            />
            <div className="absolute bottom-2 right-2 px-3 py-1 bg-black/70 backdrop-blur rounded-full text-white text-[11px] font-medium flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
              <Eye className="w-3.5 h-3.5 text-[#d6a5b5]" />
              点击大图长按保存
            </div>
          </>
        )}
      </div>

      {/* Save Tips for Mobile / Elderly Users */}
      <div className="w-full mb-3 px-3 py-2 bg-[#fdf8fa] rounded-xl border border-[#f3e1e7] text-[11px] text-[#a88892] flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-[#d6a5b5] shrink-0" />
        <span>📱 提示：在手机上长按上方图片，选【保存到相册】即可存入手机相册</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2.5 w-full">
        <button
          type="button"
          onClick={handleSaveToGallery}
          disabled={isGenerating || !synthesizedUrl}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-full bg-[#d6a5b5] hover:bg-[#c492a2] active:scale-95 text-white font-bold text-sm shadow-md shadow-[#d6a5b5]/30 transition-all disabled:opacity-50"
        >
          <Share2 className="w-4.5 h-4.5" />
          保存至手机相册
        </button>

        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            onClick={handleDownloadFile}
            disabled={isGenerating || !synthesizedUrl}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] text-[#333333] font-bold text-xs transition-all"
          >
            <Download className="w-4 h-4 text-[#a88892]" />
            下载图片文件
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] text-[#a88892] font-bold text-xs transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            重新选图
          </button>
        </div>
      </div>

      {/* Full-screen Preview Modal for Long-Press Save */}
      {isPreviewOpen && (
        <div
          onClick={() => setIsPreviewOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-between p-4"
        >
          <div className="w-full flex justify-between items-center text-white text-xs pt-2 px-2">
            <span className="font-bold flex items-center gap-1.5 text-emerald-400">
              <Sparkles className="w-4 h-4" />
              长按下方图片选择【保存到相册】
            </span>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="py-1 px-3 rounded-full bg-white/20 text-white font-bold"
            >
              关闭
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center w-full my-auto overflow-auto">
            <img
              src={synthesizedUrl}
              alt="手写账单图片"
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl select-all"
            />
          </div>

          <div className="w-full max-w-sm pb-4 text-center">
            <button
              type="button"
              onClick={handleDownloadFile}
              className="w-full py-3 rounded-full bg-[#d6a5b5] text-white font-bold text-xs shadow-lg"
            >
              直接下载图片文件
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

