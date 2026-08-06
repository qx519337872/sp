import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, Share2, Image as ImageIcon, Sparkles, Smartphone, Eye } from 'lucide-react';
import { formatAmountWithCommas } from '../utils/format';
import { DetectedCard } from '../types';

interface Props {
  originalImageSrc: string;
  totalAmount: number;
  itemCount: number;
  summaryDate: string;
  cards?: DetectedCard[];
  onRestart: () => void;
}

export const ResultSynthesizer: React.FC<Props> = ({
  originalImageSrc,
  totalAmount,
  itemCount,
  summaryDate,
  cards = [],
  onRestart,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [synthesizedUrl, setSynthesizedUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true); // Default auto-crop on to cut off legs/basket at bottom

  useEffect(() => {
    if (!originalImageSrc) return;

    let isMounted = true;
    setIsGenerating(true);

    const renderCanvas = (img: HTMLImageElement) => {
      if (!isMounted) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const fullW = img.naturalWidth || 800;
      const fullH = img.naturalHeight || 800;

      // Calculate auto-crop box (cut off legs / basket / empty desk at bottom if present)
      let cropSx = 0;
      let cropSy = 0;
      let cropSw = fullW;
      let cropSh = fullH;

      if (autoCrop && cards && cards.length > 0) {
        let minY = 1, minX = 1, maxY = 0, maxX = 0;
        let validBoxes = 0;
        cards.forEach((c) => {
          if (c.box_2d && c.box_2d.length === 4) {
            const [y1, x1, y2, x2] = c.box_2d;
            minY = Math.min(minY, y1 / 1000);
            minX = Math.min(minX, x1 / 1000);
            maxY = Math.max(maxY, y2 / 1000);
            maxX = Math.max(maxX, x2 / 1000);
            validBoxes++;
          }
        });

        if (validBoxes > 0 && maxY > minY) {
          // Crop margins: 5% around cards, plus extra bottom margin (+0.24) for handwritten total
          const cropMinX = Math.max(0, minX - 0.05);
          const cropMaxX = Math.min(1, maxX + 0.05);
          const cropMinY = Math.max(0, minY - 0.05);
          const cropMaxY = Math.min(1, maxY + 0.24); // Leaves clean space for handwritten block below cards

          cropSx = Math.round(cropMinX * fullW);
          cropSy = Math.round(cropMinY * fullH);
          cropSw = Math.round((cropMaxX - cropMinX) * fullW);
          cropSh = Math.round((cropMaxY - cropMinY) * fullH);
        }
      }

      canvas.width = cropSw;
      canvas.height = cropSh;

      // Draw cropped/full background image region
      ctx.drawImage(img, cropSx, cropSy, cropSw, cropSh, 0, 0, cropSw, cropSh);

      const shortSide = Math.min(canvas.width, canvas.height);
      const fontSizeBig = Math.round(shortSide * 0.072);
      const fontSizeMid = Math.round(shortSide * 0.045);
      const padding = Math.round(shortSide * 0.035);

      // Format text values with thousands comma separators from the right (e.g. 2,020 or 4,810)
      const totalStr = formatAmountWithCommas(totalAmount);

      let dateMD = summaryDate;
      if (!dateMD || !dateMD.includes('/')) {
        const dObj = new Date(summaryDate || Date.now());
        dateMD = !isNaN(dObj.getTime())
          ? `${dObj.getMonth() + 1}/${dObj.getDate()}`
          : `${new Date().getMonth() + 1}/${new Date().getDate()}`;
      }
      const countStr = `${itemCount}件`;

      // Hand writing fonts: 'MyCustomFont' defined in backend index.css is loaded first if uploaded by owner!
      // 'Caveat', 'Architects Daughter', 'Patrick Hand' render authentic slender ballpoint/gel-pen digits without crossbar on '7'
      const fontEn = '"MyCustomFont", "Caveat", "Architects Daughter", "Patrick Hand", "Shadows Into Light", "Indie Flower", cursive, sans-serif';
      const fontCn = '"MyCustomFont", "Zhi Mang Xing", "Long Cang", "Ma Shan Zheng", cursive, sans-serif';
      
      // Gel pen / ballpoint ink color matching sample photo (#0f4dc7)
      const inkColorPrimary = '#0f4dc7';

      ctx.save();
      ctx.font = `400 ${fontSizeBig}px ${fontEn}`;
      const totalW = ctx.measureText(totalStr).width;

      ctx.font = `400 ${fontSizeMid}px ${fontEn}`;
      const dateW = ctx.measureText(dateMD).width;

      ctx.font = `400 ${fontSizeMid}px ${fontCn}`;
      const countW = ctx.measureText(countStr).width;
      ctx.restore();

      const leftColW = Math.max(dateW, countW);
      const blockW = leftColW + padding * 0.9 + totalW;
      const blockH = fontSizeMid * 1.2 + fontSizeMid * 1.2;

      const boxX = canvas.width - padding * 1.2 - blockW;
      const boxY = canvas.height - padding * 1.2 - blockH;

      // Soft paper-like clean backdrop pad with slight rounded corners
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
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

      // Slender, slanted gel pen handwriting rendering matching sample photo 1 & 2
      const drawHandwrittenText = (
        text: string,
        x: number,
        y: number,
        fSize: number,
        fontFamily: string,
        baseAngleDeg = -4.0 // Natural forward slant for right-handed speed pen handwriting
      ) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((baseAngleDeg * Math.PI) / 180);
        ctx.font = `400 ${fSize}px ${fontFamily}`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = inkColorPrimary;
        ctx.globalAlpha = 0.96;

        let cursorX = 0;
        const chars = String(text).split('');
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const charW = ctx.measureText(char).width;

          ctx.save();
          // Subtle organic character variation
          const charAngle = Math.sin(i * 1.7 + x) * 1.2 * (Math.PI / 180);
          const charY = Math.cos(i * 2.5 + y) * 0.4;

          ctx.translate(cursorX, charY);
          ctx.rotate(charAngle);
          ctx.fillText(char, 0, 0);
          ctx.restore();

          cursorX += charW * 0.93; // Natural character spacing for handwritten pen
        }
        ctx.restore();
      };

      // Layout matching photo: Top Date, Bottom Count, Right Big Total
      const leftX = boxX;
      const rightX = boxX + leftColW + padding * 0.9;

      drawHandwrittenText(dateMD, leftX, boxY + fontSizeMid * 0.9, fontSizeMid, fontEn, -4.5);
      drawHandwrittenText(countStr, leftX, boxY + fontSizeMid * 0.9 + fontSizeMid * 1.2, fontSizeMid, fontCn, -4.5);
      drawHandwrittenText(totalStr, rightX, boxY + fontSizeBig * 0.9, fontSizeBig, fontEn, -4.0);

      try {
        const url = canvas.toDataURL('image/jpeg', 0.92);
        setSynthesizedUrl(url);
      } catch (err) {
        console.error('toDataURL error:', err);
        setSynthesizedUrl(originalImageSrc);
      }
      setIsGenerating(false);
    };

    const synthesize = async () => {
      // 1. Font load check with fast timeout guard
      if (document.fonts) {
        try {
          await Promise.race([
            Promise.allSettled([
              document.fonts.load('400 36px "MyCustomFont"'),
              document.fonts.load('400 36px "Caveat"'),
              document.fonts.load('400 36px "Architects Daughter"'),
              document.fonts.load('400 36px "Patrick Hand"'),
              document.fonts.load('400 36px "Shadows Into Light"'),
              document.fonts.load('400 36px "Zhi Mang Xing"'),
              document.fonts.load('400 36px "Long Cang"'),
            ]),
            new Promise((res) => setTimeout(res, 400)),
          ]);
        } catch (fontErr) {
          console.warn('Font load check warning:', fontErr);
        }
      }

      const img = new Image();
      // CRITICAL FOR MOBILE SAFARI: NEVER set crossOrigin for data: URLs
      if (!originalImageSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }

      let hasHandled = false;
      const triggerRender = () => {
        if (!isMounted) return;
        hasHandled = true;
        renderCanvas(img);
      };

      img.onload = () => {
        triggerRender();
        // Re-render automatically when web fonts finish downloading
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            if (isMounted) {
              renderCanvas(img);
            }
          }).catch(() => {});
        }
      };
      img.onerror = () => {
        console.warn('Image load failed, falling back to original');
        if (!hasHandled && isMounted) {
          hasHandled = true;
          setSynthesizedUrl(originalImageSrc);
          setIsGenerating(false);
        }
      };

      img.src = originalImageSrc;

      // Direct fallback timeout if mobile browser stalls img.onload
      setTimeout(() => {
        if (!hasHandled && isMounted) {
          triggerRender();
        }
      }, 1200);
    };

    synthesize();

    return () => {
      isMounted = false;
    };
  }, [originalImageSrc, totalAmount, itemCount, summaryDate, cards, autoCrop]);

  // Directly save / share to photo album
  const handleSaveToGallery = async () => {
    if (!synthesizedUrl) return;

    const fileName = `账单汇总_${summaryDate.replace('/', '_') || 'today'}.jpg`;

    // 1. Try Web Share API (native share sheet on iOS Safari / Android Chrome / WeChat)
    try {
      if (navigator.share && navigator.canShare) {
        const response = await fetch(synthesizedUrl);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: '账单汇总',
          });
          setShareSuccess(true);
          setTimeout(() => setShareSuccess(false), 4000);
          return;
        }
      }
    } catch (shareErr) {
      console.log('Native share cancelled or failed, falling back to download:', shareErr);
    }

    // 2. Standard download link fallback
    const link = document.createElement('a');
    link.href = synthesizedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 3. On mobile devices, automatically show the preview modal with long-press tip
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setTimeout(() => {
        setIsPreviewOpen(true);
      }, 300);
    }

    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 4000);
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
        className="relative w-full rounded-2xl overflow-hidden border border-[#ece2e6] bg-[#222222] shadow-inner min-h-[260px] flex items-center justify-center mb-4 cursor-pointer group"
      >
        {isGenerating ? (
          <div className="flex flex-col items-center gap-3 text-white/80 py-12">
            <div className="w-8 h-8 border-4 border-[#d6a5b5] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">正在渲染蓝墨水手写汇总图...</span>
          </div>
        ) : (
          <img
            src={synthesizedUrl}
            alt="合成图像"
            className="w-full max-h-[480px] object-contain block"
          />
        )}
      </div>


      {/* Two Action Buttons: Left = 重新选图, Right = 保存至手机相册 */}
      <div className="flex items-center gap-2 sm:gap-3 w-full">
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 sm:px-4 rounded-full bg-[#f7f2f4] hover:bg-[#ece2e6] active:scale-95 text-[#4a2e3a] font-bold text-xs sm:text-sm whitespace-nowrap transition-all"
        >
          <RefreshCw className="w-4 h-4 text-[#a88892] shrink-0" />
          <span>重新选图</span>
        </button>

        <button
          type="button"
          onClick={handleSaveToGallery}
          disabled={isGenerating || !synthesizedUrl}
          className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 sm:px-4 rounded-full bg-[#d6a5b5] hover:bg-[#c492a2] active:scale-95 text-white font-bold text-xs sm:text-sm whitespace-nowrap shadow-md shadow-[#d6a5b5]/30 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>保存至手机相册</span>
        </button>
      </div>

      {shareSuccess && (
        <div className="mt-2.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          已成功保存图片到相册/下载！
        </div>
      )}

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

