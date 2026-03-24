import React, { useEffect, useRef } from 'react';

interface QuestionCanvasProps {
  text: string;
  className?: string;
}

export const QuestionCanvas: React.FC<QuestionCanvasProps> = ({ text, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const width = 800;
    const fontSize = 20;
    const padding = 20;
    
    // Measure text to determine height
    ctx.font = `${fontSize}px 'JetBrains Mono', 'Courier New', monospace`;
    const paragraphs = text.split('\n');
    const lines: string[] = [];
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') {
        lines.push('');
        return;
      }
      const words = paragraph.split(' ');
      let line = '';
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > width - padding * 2 && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);
    });

    canvas.width = width;
    canvas.height = lines.length * (fontSize * 1.5) + padding * 2;

    // Draw background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    ctx.fillStyle = 'black';
    ctx.font = `${fontSize}px 'JetBrains Mono', 'Courier New', monospace`;
    ctx.textBaseline = 'top';

    lines.forEach((l, i) => {
      ctx.fillText(l, padding, padding + i * (fontSize * 1.5));
    });

  }, [text]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`max-w-full h-auto border border-black/5 rounded-lg shadow-sm ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
};
