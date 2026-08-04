import React, { useRef, useEffect } from 'react';
import { DetectedCard } from '../types';
import { Plus, Trash2, Calendar, Tag, CreditCard, Sparkles } from 'lucide-react';

interface Props {
  imageSrc: string;
  cards: DetectedCard[];
  selectedCardId: string | null;
  summaryDate: string;
  onSelectCard: (id: string | null) => void;
  onUpdateCard: (id: string, field: keyof DetectedCard, value: any) => void;
  onDeleteCard: (id: string) => void;
  onAddCard: () => void;
  onUpdateSummaryDate: (date: string) => void;
}

// Sub-component to render cropped card image thumbnail
const CardCropThumbnail: React.FC<{ imageSrc: string; box_2d: [number, number, number, number] }> = ({ imageSrc, box_2d }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const [ymin, xmin, ymax, xmax] = box_2d;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;

      const sx = (xmin / 1000) * nw;
      const sy = (ymin / 1000) * nh;
      const sw = Math.max(1, ((xmax - xmin) / 1000) * nw);
      const sh = Math.max(1, ((ymax - ymin) / 1000) * nh);

      canvas.width = 120;
      canvas.height = 90;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    };
  }, [imageSrc, box_2d]);

  return (
    <canvas
      ref={canvasRef}
      className="w-20 h-16 object-cover rounded-lg border border-slate-200 bg-slate-100 flex-shrink-0 shadow-sm"
    />
  );
};

export const CardEditorList: React.FC<Props> = ({
  imageSrc,
  cards,
  selectedCardId,
  summaryDate,
  onSelectCard,
  onUpdateCard,
  onDeleteCard,
  onAddCard,
  onUpdateSummaryDate,
}) => {
  // Calculate total amount and count
  const totalAmount = cards.reduce((sum, card) => {
    const val = parseFloat(String(card.amount));
    return sum + (!isNaN(val) && val > 0 ? val : 0);
  }, 0);

  const itemCount = cards.length;

  return (
    <div className="flex flex-col gap-4 w-full bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-rose-500" />
            商品卡片明细确认
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            核对每张卡片的识别矩形框区域、金额与日期
          </p>
        </div>
        <button
          type="button"
          onClick={onAddCard}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium text-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          手动增加卡片框
        </button>
      </div>

      {/* Summary Date Row */}
      <div className="flex items-center gap-3 bg-rose-50/50 p-3 rounded-xl border border-rose-100/80">
        <Calendar className="w-4 h-4 text-rose-500 flex-shrink-0" />
        <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
          汇总合成日期:
        </label>
        <input
          type="date"
          value={summaryDate}
          onChange={(e) => onUpdateSummaryDate(e.target.value)}
          className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
      </div>

      {/* List of cards */}
      <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1">
        {cards.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
            暂无卡片数据，点击上方“手动增加卡片框”添加
          </div>
        ) : (
          cards.map((card) => {
            const isSelected = card.id === selectedCardId;
            return (
              <div
                key={card.id}
                onClick={() => onSelectCard(card.id)}
                className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                {/* Crop thumbnail */}
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 text-center font-bold text-xs text-slate-500 w-6">
                    #{card.cardIndex}
                  </div>
                  <CardCropThumbnail imageSrc={imageSrc} box_2d={card.box_2d} />
                </div>

                {/* Editable Fields */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Label / Name */}
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={card.label || ''}
                      onChange={(e) => onUpdateCard(card.id, 'label', e.target.value)}
                      placeholder="卡片名称/代号"
                      className="w-full text-xs text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>

                  {/* Amount */}
                  <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 focus-within:border-rose-400">
                    <span className="text-xs font-bold text-rose-500">￥</span>
                    <input
                      type="number"
                      step="any"
                      value={card.amount}
                      onChange={(e) => onUpdateCard(card.id, 'amount', e.target.value)}
                      placeholder="金额"
                      className="w-full text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={card.date || ''}
                      onChange={(e) => onUpdateCard(card.id, 'date', e.target.value)}
                      placeholder="日期 (如 7/28)"
                      className="w-full text-xs text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCard(card.id);
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors self-end sm:self-center"
                  title="删除此卡片"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Summary Bar */}
      <div className="flex items-center justify-between bg-slate-900 text-white p-4 rounded-xl mt-2 shadow-md">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-rose-400" />
          <span className="text-xs text-slate-300">识别汇总计算</span>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">有效商品数</div>
            <div className="text-sm font-bold text-white">{itemCount} 件</div>
          </div>
          <div>
            <div className="text-[10px] text-rose-300 uppercase tracking-wider">合计金额</div>
            <div className="text-xl font-black text-rose-400">
              ￥{Number.isInteger(totalAmount) ? totalAmount : totalAmount.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
