export interface BoundingBox2D {
  /** [ymin, xmin, ymax, xmax] normalized 0 - 1000 */
  box_2d: [number, number, number, number];
  label?: string;
  amount?: number | string;
  date?: string;
  confidence?: number;
}

export interface DetectedCard {
  id: string;
  cardIndex: number;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  label: string;
  amount: number | string;
  date: string;
  confidence?: number;
}

export interface DetectionResult {
  cards: DetectedCard[];
  summaryDate: string;
  totalAmount: number;
  source: 'gemini' | 'fallback';
  rawText?: string;
  message?: string;
  error?: string;
}
