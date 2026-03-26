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
      <div className="p-4 border-b-2 border-black flex flex-col gap-4 bg-zinc-50">
        <div className="flex justify-between items-center">
          <h3 className="font-black uppercase italic tracking-tighter whitespace-nowrap">Resource Viewer</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors text-zinc-600"><X size={24} /></button>
        </div>
        
        {isPdf && (
          <form onSubmit={handleGo} className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="text" 
                placeholder="Find words..." 
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-black rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase">Page</span>
              <input 
                type="text" 
                placeholder="1" 
                value={localPage}
                onChange={(e) => setLocalPage(e.target.value)}
                className="w-16 px-2 py-2 border-2 border-black rounded-lg text-sm text-center focus:outline-none"
              />
              <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-none">GO</button>
            </div>
          </form>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden bg-zinc-100 flex flex-col">
        <div className="flex-1 relative">
          {isPdf ? (
            <>
              {/* Protective overlay to block interaction with the floating toolbar area in some browsers */}
              {/* This prevents users from clicking zoom/pop-out buttons that might appear at the top */}
              <div className="absolute top-0 left-0 right-0 h-12 z-10 bg-transparent pointer-events-none sm:pointer-events-auto" title="Interaction with PDF toolbar is disabled" />
              
              <iframe 
                key={`${url}-${search}-${page}`} // Re-render iframe ONLY when search or page is SUBMITTED
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
