import React, { useRef } from 'react';

interface Props {
  onImageSelected: (base64: string, file: File) => void;
  isLoading: boolean;
}

export const ImageUploader: React.FC<Props> = ({ onImageSelected, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        onImageSelected(base64, file);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center justify-between w-full h-full py-8 px-2 min-h-[440px]">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Clipboard Icon & Text */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-auto">
        <div className="w-16 h-16 mb-4 flex items-center justify-center text-4xl">
          📋
        </div>
        <p className="text-sm font-medium text-[#b0a2a7] tracking-wide">
          拍照或选择照片，自动识别
        </p>
      </div>

      {/* Bottom 2 Large Square Buttons */}
      <div className="grid grid-cols-2 gap-4 w-full pt-8">
        {/* Select Photo Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex flex-col items-center justify-center p-7 rounded-3xl bg-[#f7f2f4] hover:bg-[#ede5e8] active:scale-95 transition-all shadow-sm"
        >
          <span className="text-3xl mb-2">🖼️</span>
          <span className="text-sm font-bold text-[#333333]">选择照片</span>
        </button>

        {/* Camera Button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isLoading}
          className="flex flex-col items-center justify-center p-7 rounded-3xl bg-[#d6a5b5] hover:bg-[#c894a4] active:scale-95 transition-all shadow-sm"
        >
          <span className="text-3xl mb-2">📷</span>
          <span className="text-sm font-bold text-white">相机</span>
        </button>
      </div>
    </div>
  );
};

