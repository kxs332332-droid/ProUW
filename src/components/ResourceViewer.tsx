import React from 'react';
import { X, Search } from 'lucide-react';

interface ResourceViewerProps {
  url: string;
  type?: string;
  onClose: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  page?: string;
  onPageChange?: (val: string) => void;
}

export const ResourceViewer: React.FC<ResourceViewerProps> = ({ url, type, onClose, search, onSearchChange, page = '', onPageChange }) => {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [localPage, setLocalPage] = React.useState(page);
  const [localSearch, setLocalSearch] = React.useState(search);

  React.useEffect(() => {
    setLocalPage(page);
  }, [page]);

  React.useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  React.useEffect(() => {
    if (url.startsWith('data:application/pdf')) {
      // Convert data URL to blob URL for better iframe compatibility
      const parts = url.split(',');
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      const newBlobUrl = URL.createObjectURL(blob);
      setBlobUrl(newBlobUrl);
      return () => URL.revokeObjectURL(newBlobUrl);
    } else {
      setBlobUrl(null);
    }
  }, [url]);

  // Helper to process common cloud storage links for iframes
  const getEmbedUrl = (originalUrl: string) => {
    let processedUrl = originalUrl;
    
    if (blobUrl) {
      processedUrl = blobUrl;
    } else if (processedUrl.includes('drive.google.com/file/d/')) {
      processedUrl = processedUrl.replace('/view', '/preview').replace('/edit', '/preview');
    } else if (processedUrl.includes('dropbox.com') && processedUrl.endsWith('?dl=0')) {
      processedUrl = processedUrl.replace('?dl=0', '?raw=1');
    }

    const params: string[] = [];
    // Using the props (submitted values) for the URL
    if (search.trim()) params.push(`search=${encodeURIComponent(search)}`);
    if (page.trim()) params.push(`page=${page}`);
    
    // Standard PDF open parameters to hide toolbars and prevent pop-outs
    // toolbar=0: hide toolbar
    // navpanes=0: hide navigation panes
    // scrollbar=1: keep scrollbar
    // view=FitH: fit to width
    params.push('toolbar=0');
    params.push('navpanes=0');
    params.push('scrollbar=1');
    params.push('statusbar=0');
    params.push('messages=0');
    params.push('view=FitH');

    if (params.length > 0 && !processedUrl.startsWith('data:')) {
      return `${processedUrl}#${params.join('&')}`;
    }
    return processedUrl;
  };

  const isPdf = type === 'PDF' ||
                url.toLowerCase().includes('.pdf') || 
                url.includes('/preview') || 
                url.includes('drive.google.com') || 
                url.includes('dropbox.com') ||
                url.includes('blob:') ||
                url.startsWith('data:application/pdf');

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    if (onPageChange) onPageChange(localPage);
    if (onSearchChange) onSearchChange(localSearch);
  };

  return (
    <div className="flex flex-col h-full border-l-4 border-black bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.1)]">
      <div className="p-4 border-b-2 border-black flex justify-between items-center bg-zinc-50">
        <h3 className="font-black uppercase italic tracking-tighter whitespace-nowrap">Resource Viewer</h3>
        <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-zinc-600"><X size={24} /></button>
      </div>
      <div className="flex-1 relative overflow-hidden bg-zinc-100 flex flex-col">
        <div className="flex-1 relative">
          {isPdf ? (
            <>
              {/* Protective overlay to block interaction with the floating toolbar area in some browsers */}
              {/* This prevents users from clicking zoom/pop-out buttons that might appear at the top */}
              <div className="absolute top-0 left-0 right-0 h-16 z-10 bg-transparent pointer-events-auto" title="Interaction with PDF toolbar is disabled" />
              
              <iframe 
                key={`${url}`} 
                src={getEmbedUrl(url)} 
                className="w-full h-full border-none"
                title="Resource PDF"
                // sandbox: allow scripts and same-origin, but NO popups or new windows
                sandbox="allow-scripts allow-same-origin allow-forms"
                allow="autoplay; fullscreen"
              />
            </>
          ) : (
            <div className="w-full h-full overflow-auto p-4 flex justify-center items-start">
              <img 
                src={url} 
                alt="Resource" 
                className="max-w-full shadow-2xl border-4 border-black rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
