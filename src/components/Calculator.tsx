import React, { useState, useRef } from 'react';
import { motion, useDragControls } from 'motion/react';
import { X, Minus, Plus, Divide, Equal, Delete, Calculator as CalcIcon, GripHorizontal } from 'lucide-react';

interface CalculatorProps {
  onClose: () => void;
}

export const Calculator: React.FC<CalculatorProps> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const dragControls = useDragControls();

  const handleNumber = (num: string) => {
    if (display === '0' || display === 'Error') {
      setDisplay(num === '.' ? '0.' : num);
    } else {
      if (num === '.' && display.includes('.')) return;
      setDisplay(display + num);
    }
  };

  const handleOperator = (op: string) => {
    if (display === 'Error') return;
    if (equation && display === '0') {
      // Replace last operator if user clicks another one
      setEquation(equation.slice(0, -3) + ' ' + op + ' ');
    } else {
      setEquation(equation + display + ' ' + op + ' ');
      setDisplay('0');
    }
  };

  const calculate = () => {
    try {
      if (!equation && display === '0') return;
      
      let expr = equation + display;
      // Basic sanitization: only allow numbers and operators
      if (/[^0-9.+\-*/\s]/.test(expr)) {
        throw new Error('Invalid characters');
      }

      // Using Function constructor as a simple math evaluator
      const result = new Function(`return ${expr}`)();
      
      if (!isFinite(result)) throw new Error('Division by zero');

      // Format result to avoid long decimals
      const formattedResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(8));
      setDisplay(String(formattedResult));
      setEquation('');
    } catch (e) {
      setDisplay('Error');
      setEquation('');
    }
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.5, y: -100 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -100 }}
      style={{ left: 'calc(50% - 144px)', top: '20px' }}
      className="fixed z-[10000] w-72 bg-white border-4 border-black rounded-2xl shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
    >
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="bg-black p-3 flex justify-between items-center text-white cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <CalcIcon size={14} className="text-emerald-400" />
          <span className="font-black text-[10px] tracking-widest uppercase">Quick Calc</span>
        </div>
        <GripHorizontal size={16} className="text-zinc-600" />
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }} 
          className="hover:text-red-400 transition-colors p-1"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-5 bg-zinc-50 border-b-4 border-black text-right">
        <div className="text-[10px] text-zinc-400 h-4 overflow-hidden uppercase font-bold tracking-tighter mb-1">
          {equation || '\u00A0'}
        </div>
        <div className="text-4xl font-black truncate font-mono tracking-tighter">
          {display}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 p-4 bg-white">
        <button onClick={clear} className="col-span-2 p-4 bg-red-500 text-white border-2 border-black rounded-xl font-black hover:bg-red-600 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">AC</button>
        <button onClick={() => setDisplay(display.length > 1 ? display.slice(0, -1) : '0')} className="p-4 bg-zinc-200 border-2 border-black rounded-xl font-black hover:bg-zinc-300 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <Delete size={20} className="mx-auto" />
        </button>
        <button onClick={() => handleOperator('/')} className="p-4 bg-emerald-400 border-2 border-black rounded-xl font-black hover:bg-emerald-500 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <Divide size={20} className="mx-auto" />
        </button>

        {[7, 8, 9].map(n => (
          <button key={n} onClick={() => handleNumber(String(n))} className="p-4 bg-white border-2 border-black rounded-xl font-black hover:bg-zinc-100 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-xl">{n}</button>
        ))}
        <button onClick={() => handleOperator('*')} className="p-4 bg-emerald-400 border-2 border-black rounded-xl font-black hover:bg-emerald-500 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <X size={20} className="mx-auto" />
        </button>

        {[4, 5, 6].map(n => (
          <button key={n} onClick={() => handleNumber(String(n))} className="p-4 bg-white border-2 border-black rounded-xl font-black hover:bg-zinc-100 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-xl">{n}</button>
        ))}
        <button onClick={() => handleOperator('-')} className="p-4 bg-emerald-400 border-2 border-black rounded-xl font-black hover:bg-emerald-500 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <Minus size={20} className="mx-auto" />
        </button>

        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => handleNumber(String(n))} className="p-4 bg-white border-2 border-black rounded-xl font-black hover:bg-zinc-100 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-xl">{n}</button>
        ))}
        <button onClick={() => handleOperator('+')} className="p-4 bg-emerald-400 border-2 border-black rounded-xl font-black hover:bg-emerald-500 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <Plus size={20} className="mx-auto" />
        </button>

        <button onClick={() => handleNumber('0')} className="col-span-2 p-4 bg-white border-2 border-black rounded-xl font-black hover:bg-zinc-100 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-xl">0</button>
        <button onClick={() => handleNumber('.')} className="p-4 bg-white border-2 border-black rounded-xl font-black hover:bg-zinc-100 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-xl">.</button>
        <button onClick={calculate} className="p-4 bg-black text-white border-2 border-black rounded-xl font-black hover:bg-zinc-800 active:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
          <Equal size={24} className="mx-auto" />
        </button>
      </div>
    </motion.div>
  );
};
